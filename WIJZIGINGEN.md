# Wijzigingen

## 16 november 2026

- Een PWA-manifest, appiconen en service-workerregistratie op alle pagina's toegevoegd.
- Een service worker toegevoegd die pushmeldingen kan tonen en bij aantikken veilig binnen Growify opent.
- De lokale ontwikkelserver uitgebreid om het manifest en de PWA-bestanden met de juiste toegang en het manifest-MIME-type aan te bieden.
- Dagelijkse pushherinneringen toegevoegd met een beveiligde Supabase-tabel, instelbare lokale tijd, Edge Function en GitHub Actions-workflow. De sleutels en deployment moeten nog worden ingesteld.
- Een afgeschermd beheeronderdeel toegevoegd waarmee alleen het ingestelde Supabase-account een testmelding naar het eigen apparaat kan sturen.

## 11 november 2026

- Automatische browsermeldingen voor verzorgingsmomenten toegevoegd op de geplande dag.
- De homepage, Mijn planten en de kalender controleren de planning zolang de pagina open is; toestemming van de gebruiker is vereist.
- Dubbele meldingen voor dezelfde taak op dezelfde datum worden per browser voorkomen.
- De knoppen en uitleg verduidelijken dat meldingen niet aankomen nadat Growify of de browser is gesloten.
- Tests toegevoegd voor meldingen van vandaag, dubbele meldingen, ontbrekende toestemming en uitgestelde taken.
- Een plant na verwijderen binnen 10 seconden met profiel, foto, logboek en planning kunnen herstellen.
- Growify-accountback-ups valideren en na een preview samenvoegen; bestaande profielgegevens blijven leidend.
- Per plant-exemplaar aangepaste intervallen voor aardecontrole, voeding en verpotten instellen.
- Aanvullende verzorgingsinformatie en bron/controledatum zichtbaar maken op plantpagina's waar die gegevens al beschikbaar zijn; ontbrekende bronnen worden expliciet gemeld.
- Tests toegevoegd voor importvalidatie, samenvoegen, custom intervallen, catalogusbronnen en de pagina-integratie.
- Een regressietest toegevoegd die controleert of ongedaan maken een verwijderde plant en het profiel, logboek, aangepaste intervallen en verzorgingstaken herstelt.

### Grenzen

De bestaande browsermeldingen werken alleen zolang een Growify-pagina openstaat. Pushherinneringen wanneer Growify gesloten is werken nadat de Supabase-inrichting, VAPID-sleutels en GitHub Actions-workflow zijn ingesteld en gedeployed. De workflow controleert elk uur; bezorging op de exacte minuut is niet gegarandeerd.
