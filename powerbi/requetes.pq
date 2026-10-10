// =====================================================================
//  VGC META OVERVIEW, REQUÊTES POWER QUERY
//  Charge les CSV directement depuis le dépôt GitHub : le rapport se met
//  à jour avec un simple « Actualiser » après le commit mensuel.
//
//  Mode d'emploi : voir powerbi/GUIDE.md, étape 1.
//  Chaque bloc ci-dessous est UNE requête. Dans Power Query :
//  Accueil > Nouvelle source > Requête vide, puis Éditeur avancé,
//  colle le bloc et renomme la requête avec le nom indiqué.
// =====================================================================


// ---------------------------------------------------------------------
// Requête : UrlDonnees   (paramètre texte)
// Plus simple : Accueil > Gérer les paramètres > Nouveau paramètre,
// nom UrlDonnees, type Texte, valeur ci-dessous.
// ---------------------------------------------------------------------
"https://raw.githubusercontent.com/karlfring/vgc-meta-observatory/main/data/processed/" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]


// ---------------------------------------------------------------------
// Requête : fnChargerCsv   (fonction)
// RelativePath garde l'URL de base fixe, ce qui permet l'actualisation
// planifiée dans le service Power BI. Le typage se fait en culture
// en-US : le point des CSV est lu comme séparateur décimal, quelle que
// soit la langue de Power BI.
// ---------------------------------------------------------------------
(nomFichier as text, types as list) as table =>
let
    Source = Csv.Document(
        Web.Contents(UrlDonnees, [RelativePath = nomFichier]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    EnTetes = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
    Types = Table.TransformColumnTypes(EnTetes, types, "en-US")
in
    Types


// ---------------------------------------------------------------------
// Requête : dim_pokemon
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("dim_pokemon.csv", {
        {"pokemon", type text}, {"espece", type text},
        {"forme", type text}, {"est_mega", type logical}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : dim_pokemon_partenaire   (copie, pour fact_teammate)
// ---------------------------------------------------------------------
let
    Source = dim_pokemon
in
    Source


// ---------------------------------------------------------------------
// Requête : dim_pokemon_adverse   (copie, pour fact_counter)
// ---------------------------------------------------------------------
let
    Source = dim_pokemon
in
    Source


// ---------------------------------------------------------------------
// Requête : dim_date
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("dim_date.csv", {
        {"date_snapshot", type date}, {"annee", Int64.Type},
        {"mois", Int64.Type}, {"libelle_mois", type text}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : dim_regulation
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("dim_regulation.csv", {
        {"regulation", type text}, {"format_id", type text},
        {"date_debut", type date}, {"date_fin", type date},
        {"est_courante", type logical}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : dim_rating_bracket
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("dim_rating_bracket.csv", {
        {"palier", Int64.Type}, {"libelle", type text}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : fact_usage
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("fact_usage.csv", {
        {"date_snapshot", type date}, {"regulation", type text},
        {"format_id", type text}, {"palier", Int64.Type},
        {"rang", Int64.Type}, {"pokemon", type text},
        {"usage_pct", type number}, {"raw_count", Int64.Type},
        {"raw_pct", type number}, {"real_count", Int64.Type},
        {"real_pct", type number}, {"snapshot_index", Int64.Type}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : fact_moveset
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("fact_moveset.csv", {
        {"date_snapshot", type date}, {"regulation", type text},
        {"format_id", type text}, {"palier", Int64.Type},
        {"pokemon", type text}, {"attribut_type", type text},
        {"attribut_valeur", type text}, {"pct", type number},
        {"nature", type text}, {"evs", type text},
        {"viability_ceiling", type number}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : fact_spread   (dérivée de fact_moveset)
// Une ligne par spread détaillé par Smogon, avec les 6 statistiques en
// colonnes : "Adamant:32/32/0/0/2/0" donne nature Adamant, pv 32,
// attaque 32, defense 0, atq_spe 0, def_spe 2, vitesse 0.
// ---------------------------------------------------------------------
let
    Source = fact_moveset,
    Spreads = Table.SelectRows(Source, each [attribut_type] = "spread"),
    Colonnes = Table.SelectColumns(Spreads,
        {"date_snapshot", "regulation", "palier", "pokemon", "nature", "evs", "pct"}),
    Decoupe = Table.SplitColumn(Colonnes, "evs",
        Splitter.SplitTextByDelimiter("/", QuoteStyle.None),
        {"pv", "attaque", "defense", "atq_spe", "def_spe", "vitesse"}),
    Types = Table.TransformColumnTypes(Decoupe, {
        {"pv", Int64.Type}, {"attaque", Int64.Type}, {"defense", Int64.Type},
        {"atq_spe", Int64.Type}, {"def_spe", Int64.Type}, {"vitesse", Int64.Type}
    }, "en-US")
in
    Types


// ---------------------------------------------------------------------
// Requête : fact_teammate
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("fact_teammate.csv", {
        {"date_snapshot", type date}, {"regulation", type text},
        {"format_id", type text}, {"palier", Int64.Type},
        {"pokemon", type text}, {"pokemon_partenaire", type text},
        {"teammate_pct", type number}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : fact_counter
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("fact_counter.csv", {
        {"date_snapshot", type date}, {"regulation", type text},
        {"format_id", type text}, {"palier", Int64.Type},
        {"pokemon", type text}, {"pokemon_adverse", type text},
        {"score_matchup", type number}, {"moyenne", type number},
        {"ecart_type", type number}, {"ko_pct", type number},
        {"switch_pct", type number}
    })
in
    Source


// ---------------------------------------------------------------------
// Requête : fact_snapshot
// ---------------------------------------------------------------------
let
    Source = fnChargerCsv("fact_snapshot.csv", {
        {"date_snapshot", type date}, {"mois_source", type text},
        {"regulation", type text}, {"format_id", type text},
        {"palier", Int64.Type}, {"genre", type text},
        {"total_battles", type number}, {"avg_weight_team", type number},
        {"nb_pokemon", Int64.Type}, {"sha256", type text},
        {"ingere_le", type datetimezone}
    })
in
    Source
