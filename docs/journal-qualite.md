# Journal qualité

Les erreurs les plus dangereuses d'un pipeline sont celles qui produisent un
résultat plausible : rien ne plante, les tables se remplissent, et les chiffres
sont faux. Ce journal garde la trace de celles qui ont été trouvées, de la façon
dont elles l'ont été, et du test qui empêche leur retour.

## 1. Une section entière ignorée en silence

**Symptôme.** Aucun. Les tables se remplissaient normalement.

**Cause.** La régulation M-C a introduit une section « Checks and Counters »
dans les fichiers moveset. Ses lignes ne suivent pas le même gabarit que les
autres : elles tiennent sur deux lignes et ne se terminent pas par la barre
verticale de fermeture. Le parser, qui l'exigeait, les sautait sans erreur.

**Détection.** En confrontant la sortie du parser au fichier brut : la section
existait dans le fichier, mais aucune ligne correspondante n'apparaissait en
sortie.

**Correction.** La barre de fermeture devient optionnelle et un parser dédié
lit le format sur deux lignes (score, intervalle, taux de K.O. et de sortie
forcée). Les matchups alimentent une table propre, `fact_counter`.

**Tests associés.**
- `test_counter_extrait_score_et_intervalle`
- `test_counter_extrait_ko_et_switch`
- `test_counter_sans_ligne_de_stats_reste_exploitable`
- `test_moveset_couvre_toutes_les_sections`

## 2. Le dernier mois publié, exclu

**Symptôme.** Aucun message d'erreur ; le pipeline ingérait simplement un mois
de moins que prévu.

**Cause.** Le calcul des mois disponibles s'arrêtait un mois trop tôt : la
borne de fin était exclue au lieu d'être incluse. Or le mois le plus récent est
précisément celui qui intéresse le plus.

**Correction.** La fenêtre va désormais jusqu'au mois précédant la date du
jour, inclus. Le mois en cours reste exclu, puisque Smogon ne le publie que le
1er du mois suivant.

**Tests associés.**
- `test_le_dernier_mois_clos_est_inclus`
- `test_le_mois_en_cours_est_exclu`
- `test_regulation_demarree_ce_mois_ci_ne_renvoie_rien`

## Garde-fous permanents

- Les 15 tests s'exécutent avant chaque ingestion mensuelle : un échec bloque le
  commit des données.
- Chaque fichier ingéré est tracé dans `fact_snapshot` avec son empreinte
  SHA-256 et son nombre de batailles.
- Les fichiers bruts sont archivés : tout chiffre peut être recalculé à partir
  de la source exacte.
