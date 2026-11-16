# Dagelijkse pushherinneringen instellen

Growify kan ingelogde gebruikers een dagelijkse telefoonmelding sturen voor openstaande controles van de potgrond. De PWA-service worker toont de melding, Supabase bewaart de abonnementen en de Edge Function verstuurt ze. GitHub Actions controleert ieder uur of het voor een gebruiker tijd is.

## 1. Werk de Supabase-database bij

Voer de volledige bijgewerkte [setup.sql](../supabase/setup.sql) opnieuw uit in **Supabase → SQL Editor**. Dit voegt onder andere de voorkeurstijd, tijdzone en datum van de laatst verstuurde melding toe. De setup is herhaalbaar en verwijdert geen plantgegevens.

## 2. Maak VAPID-sleutels

Voer in de PowerShell-terminal uit:

```powershell
npx.cmd --yes web-push generate-vapid-keys
```

De openbare sleutel komt in `push-config.js`. De privésleutel hoort alleen in Supabase Secrets. Deel of commit de privésleutel nooit.

## 3. Stel de Supabase Secrets in

Maak een willekeurig geheim voor GitHub Actions:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Bewaar de uitvoer privé. Voeg in **Supabase → Edge Functions → Secrets** deze waarden toe:

| Naam | Waarde |
|---|---|
| `CRON_SECRET` | Het willekeurige geheim dat je net maakte |
| `VAPID_PUBLIC_KEY` | De openbare VAPID-sleutel |
| `VAPID_PRIVATE_KEY` | De privésleutel uit de VAPID-uitvoer |
| `VAPID_SUBJECT` | Een contactadres, bijvoorbeeld `mailto:naam@voorbeeld.nl` |

De Supabase Edge Function gebruikt de ingebouwde `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY`. Zet de service-role-sleutel niet in GitHub of de website.

## 4. Deploy de Edge Function

Installeer de [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Koppel daarna deze projectmap aan het bestaande Supabase-project:

```powershell
supabase login
supabase link --project-ref JOUW_PROJECT_ID
supabase functions deploy send-reminders
```

De project-ID is het deel vóór `.supabase.co` in de URL van het project. De functie controleert zelf `CRON_SECRET`; de instelling `verify_jwt = false` is nodig omdat GitHub Actions geen gebruikers-JWT gebruikt.

### Alleen voor jouw account: testpaneel

Kopieer in **Supabase → Authentication → Users** de User UID van jouw eigen account. Voeg bij **Edge Functions → Secrets** ook `PUSH_TEST_ADMIN_USER_ID` toe met die UID en deploy `send-reminders` opnieuw. De homepage toont daarna na het inloggen bij jouw account een beheeronderdeel. De server controleert de UID bij ieder verzoek; andere accounts kunnen het onderdeel en de handmatige verzending niet gebruiken. **Stuur herinnering nu** gebruikt dezelfde berekening en melding als de normale dagelijkse herinnering, maar slaat de tijdscontrole en de beperking tot één dagelijkse verzending over. Als er geen taken aan de beurt zijn, stuurt de knop een algemene Growify-herinnering. De verzending gaat alleen naar het apparaat waarop je bent ingelogd en wijzigt de dagelijkse verzendstatus niet.

## 5. Voeg GitHub Actions-waarden toe

Open de repository-instellingen op GitHub en ga naar **Settings → Secrets and variables → Actions**:

- Voeg onder **Variables** `SUPABASE_URL` toe met de project-URL, bijvoorbeeld `https://project-id.supabase.co`.
- Voeg onder **Secrets** `CRON_SECRET` toe met exact hetzelfde willekeurige geheim als in Supabase.

Commit en push daarna de workflow `.github/workflows/send-push-reminders.yml` naar de standaardbranch. De workflow draait elk uur op minuut 17. Je kunt hem ook handmatig starten via **Actions → Send plant reminders → Run workflow**.

## 6. Controleer de openbare sleutel in de website

Controleer of `push-config.js` de openbare VAPID-sleutel bevat. Als de tekst `PASTE_YOUR_VAPID_PUBLIC_KEY_HERE` er nog staat, vervang die dan door de openbare sleutel. Dit is geen geheime sleutel. Commit en push de wijziging.

## 7. Schakel meldingen in en test

1. Open de gepubliceerde Growify-site via HTTPS en log in.
2. Op een iPhone: voeg Growify eerst via Safari toe aan het beginscherm en open Growify daarna vanaf dat beginscherm.
3. Kies een tijd (standaard 18:00) en tik op **Dagelijkse melding aanzetten**. Geef toestemming als de browser daarom vraagt.
4. Controleer in GitHub Actions of de handmatige workflow eindigt met een succesvolle status. Buiten het ingestelde tijdvenster hoort de functie `sent: 0` terug te geven.
5. Een echte testmelding wordt alleen verstuurd als er op dat moment een openstaande grondcontrole is en de gekozen lokale tijd is bereikt.

## Gedrag en beperkingen

- Herinneringen zijn alleen beschikbaar voor ingelogde gebruikers met plantgegevens in Supabase. Planten die alleen lokaal in de browser staan, kunnen niet door een geplande workflow worden gecontroleerd.
- De standaardtijd is 18:00 in de tijdzone van het apparaat toen de gebruiker zich aanmeldde. De gebruiker kan een andere tijd kiezen.
- De workflow draait elk uur en de functie laat een melding toe vanaf de gekozen tijd tot drie uur daarna. GitHub Actions kan vertraagd starten; bezorging op de exacte minuut is niet gegarandeerd.
- Er wordt alleen gemeld als er nog een grondcontrole openstaat. Er wordt maximaal één melding per apparaat per lokale dag gestuurd. Ongeldige abonnementen worden opgeruimd.
- Browsermeldingen zijn daarnaast afhankelijk van toestemming, internet en instellingen van de telefoon.
- De functie verstuurt alleen naar push-endpoints van FCM, Mozilla en Apple. Dit voorkomt dat door gebruikers opgeslagen willekeurige URLs als serververzoeken worden gebruikt.
