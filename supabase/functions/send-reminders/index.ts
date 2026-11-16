import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
import { buildReminderPayload, buildTestReminderPayload, getDueWateringTasks, getLocalDateTime, isAllowedPushEndpoint, isPushTestAdmin, isWithinReminderWindow } from "@shared/reminder-logic";

const pageSize = 500;
const userBatchSize = 100;
const defaultTimeZone = "Europe/Amsterdam";
const reminderWindowMinutes = 180;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (authorization.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= authorization.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getPushStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return 0;
  return Number(error.statusCode);
}

async function fetchAllSubscriptions(client: ReturnType<typeof createClient>) {
  const subscriptions = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client
      .from("sproutly_push_subscriptions")
      .select("endpoint,user_id,p256dh,auth,time_zone,preferred_time,last_sent_date")
      .order("created_at")
      .range(start, start + pageSize - 1);
    if (error) throw error;
    subscriptions.push(...data);
    if (data.length < pageSize) return subscriptions;
  }
}

async function fetchUserStates(client: ReturnType<typeof createClient>, userIds: string[]) {
  const states = new Map<string, unknown>();
  for (let start = 0; start < userIds.length; start += userBatchSize) {
    const batch = userIds.slice(start, start + userBatchSize);
    const { data, error } = await client
      .from("sproutly_user_data")
      .select("user_id,state")
      .in("user_id", batch);
    if (error) throw error;
    for (const row of data) states.set(row.user_id, row.state);
  }
  return states;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) return jsonResponse(500, { error: "CRON_SECRET is not configured." });
  const isCronRequest = isAuthorized(request, cronSecret);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!projectUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return jsonResponse(500, { error: "Required push sender secrets are not configured." });
  }

  try {
    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const client = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false } });
    if (!isCronRequest) {
      const adminUserId = Deno.env.get("PUSH_TEST_ADMIN_USER_ID");
      if (!adminUserId) return jsonResponse(503, { error: "Push test admin is not configured." });

      const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return jsonResponse(401, { error: "Sign in to use the push test panel." });
      const { data: authData, error: authError } = await client.auth.getUser(token);
      if (authError || !authData.user) return jsonResponse(401, { error: "The sign-in session is invalid or expired." });
      if (!isPushTestAdmin(authData.user.id, adminUserId)) {
        return jsonResponse(403, { authorized: false });
      }

      let body: { action?: string; endpoint?: string };
      try {
        body = await request.json();
      } catch {
        return jsonResponse(400, { error: "A valid JSON request body is required." });
      }
      if (body.action === "check-admin") return jsonResponse(200, { authorized: true });
      if (body.action !== "test" || typeof body.endpoint !== "string") {
        return jsonResponse(400, { error: "A valid push test action and endpoint are required." });
      }
      if (!isAllowedPushEndpoint(body.endpoint)) return jsonResponse(400, { error: "The push endpoint is not supported." });

      const { data: subscription, error: subscriptionError } = await client
        .from("sproutly_push_subscriptions")
        .select("endpoint,p256dh,auth")
        .eq("user_id", authData.user.id)
        .eq("endpoint", body.endpoint)
        .maybeSingle();
      if (subscriptionError) throw subscriptionError;
      if (!subscription) return jsonResponse(404, { error: "No push subscription was found for this device." });

      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, JSON.stringify(buildTestReminderPayload()));
      return jsonResponse(200, { sent: true });
    }

    const subscriptions = await fetchAllSubscriptions(client);
    const states = await fetchUserStates(client, [...new Set(subscriptions.map((item) => item.user_id))]);
    const now = new Date();
    const result = { sent: 0, skipped: 0, removed: 0, failed: 0 };

    for (const subscription of subscriptions) {
      try {
        if (!isAllowedPushEndpoint(subscription.endpoint)) {
          console.error("Skipped a push subscription with an unsupported endpoint host.");
          result.failed += 1;
          continue;
        }
        const timeZone = subscription.time_zone || defaultTimeZone;
        const preferredTime = subscription.preferred_time || "18:00";
        const local = getLocalDateTime(now, timeZone);
        if (subscription.last_sent_date === local.date
          || !isWithinReminderWindow(now, timeZone, preferredTime, reminderWindowMinutes)) {
          result.skipped += 1;
          continue;
        }

        const tasks = getDueWateringTasks(states.get(subscription.user_id), local.date);
        const payload = buildReminderPayload(tasks, local.date);
        if (!payload) {
          result.skipped += 1;
          continue;
        }

        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, JSON.stringify(payload));

        const { error: updateError } = await client
          .from("sproutly_push_subscriptions")
          .update({ last_sent_date: local.date })
          .eq("endpoint", subscription.endpoint);
        if (updateError) throw updateError;
        result.sent += 1;
      } catch (error) {
        const statusCode = getPushStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await client
            .from("sproutly_push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
          if (deleteError) {
            console.error("Could not remove an expired push subscription:", getErrorMessage(deleteError));
            result.failed += 1;
          } else {
            result.removed += 1;
          }
          continue;
        }
        console.error("Push reminder failed:", getErrorMessage(error));
        result.failed += 1;
      }
    }

    return jsonResponse(result.failed ? 500 : 200, result);
  } catch (error) {
    console.error("Push reminder job failed:", getErrorMessage(error));
    return jsonResponse(500, { error: "Push reminder job failed." });
  }
});
