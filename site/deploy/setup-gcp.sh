#!/usr/bin/env bash
# Prépare un projet Google Cloud pour que GitHub Actions déploie le site sur Cloud Run, sans clé à stocker :
# APIs, dépôt d'images, comptes de service, clé des sessions dans Secret Manager, fédération d'identité GitHub
# (Workload Identity Federation).
#
# À lancer une seule fois, par exemple dans Cloud Shell (gcloud y est déjà installé et connecté) :
#   git clone https://github.com/karlfring/vgc-meta-observatory && cd vgc-meta-observatory
#   bash site/deploy/setup-gcp.sh <id-du-projet> [région, europe-west1 par défaut]
# Le script peut être relancé sans risque : ce qui existe déjà est conservé, la clé des sessions comprise.
set -euo pipefail

PROJECT="${1:?Usage : bash site/deploy/setup-gcp.sh <id-du-projet> [région]}"
REGION="${2:-europe-west1}"
REPO="karlfring/vgc-meta-observatory"
# Identifiant numérique du dépôt (api.github.com/repos/karlfring/vgc-meta-observatory, champ « id »). Contrairement
# au nom, il ne peut pas être repris par quelqu'un d'autre si le dépôt est renommé ou supprimé.
REPO_ID="1411357963"
DEPLOY="github-deploy@${PROJECT}.iam.gserviceaccount.com"
RUNTIME="vgc-site@${PROJECT}.iam.gserviceaccount.com"

# Jamais de question de gcloud : certaines sorties sont masquées ci-dessous, une question y resterait invisible
# et le script attendrait une réponse sans rien afficher.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Un compte de service ou une API tout juste créés mettent parfois quelques secondes à être pris en compte :
# on réessaie.
retry() {
  for _ in 1 2 3 4 5; do
    "$@" && return 0
    echo "  Google Cloud n'a pas encore pris en compte le changement, nouvel essai dans 10 secondes" >&2
    sleep 10
  done
  "$@"
}

gcloud config set project "$PROJECT" >/dev/null
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

echo "1/6 APIs (Cloud Run, Artifact Registry, Secret Manager, fédération d'identité)"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com
# une API tout juste activée peut mettre une minute à répondre
for _ in $(seq 1 18); do
  gcloud artifacts repositories list --location="$REGION" >/dev/null 2>&1 && gcloud secrets list >/dev/null 2>&1 && break
  sleep 10
done

echo "2/6 Dépôt d'images, qui ne garde que les trois dernières"
gcloud artifacts repositories describe vgc --location="$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create vgc --repository-format=docker --location="$REGION" \
       --description="Images du site VGC Meta Overview"
POLICY=$(mktemp)
cat > "$POLICY" <<'JSON'
[
  {"name": "garder-les-3-dernieres", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
  {"name": "supprimer-apres-30-jours", "action": {"type": "Delete"}, "condition": {"olderThan": "30d"}}
]
JSON
gcloud artifacts repositories set-cleanup-policies vgc --location="$REGION" --policy="$POLICY" --no-dry-run >/dev/null
rm -f "$POLICY"

echo "3/6 Comptes de service : vgc-site (exécution, lit seulement la clé des sessions) et github-deploy (déploiement)"
gcloud iam service-accounts describe "$RUNTIME" >/dev/null 2>&1 \
  || gcloud iam service-accounts create vgc-site --display-name="Site VGC Meta Overview (exécution)"
gcloud iam service-accounts describe "$DEPLOY" >/dev/null 2>&1 \
  || gcloud iam service-accounts create github-deploy --display-name="Déploiement depuis GitHub Actions"
retry gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOY" \
  --role=roles/run.admin --condition=None >/dev/null
retry gcloud artifacts repositories add-iam-policy-binding vgc --location="$REGION" \
  --member="serviceAccount:$DEPLOY" --role=roles/artifactregistry.writer >/dev/null
retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:$DEPLOY" --role=roles/iam.serviceAccountUser >/dev/null

echo "4/6 Clé des sessions : tirée au hasard ici et rangée dans Secret Manager, sans jamais être affichée"
gcloud secrets describe vgc-session-key >/dev/null 2>&1 \
  || head -c 48 /dev/urandom | base64 -w0 | gcloud secrets create vgc-session-key \
       --replication-policy=user-managed --locations="$REGION" --data-file=- >/dev/null
retry gcloud secrets add-iam-policy-binding vgc-session-key --member="serviceAccount:$RUNTIME" \
  --role=roles/secretmanager.secretAccessor >/dev/null

echo "5/6 Fédération d'identité : seul le dépôt $REPO peut se connecter"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
       --display-name="GitHub Actions" --issuer-uri="https://token.actions.githubusercontent.com" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id" \
       --attribute-condition="assertion.repository_id == '$REPO_ID'"
retry gcloud iam service-accounts add-iam-policy-binding "$DEPLOY" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository_id/$REPO_ID" >/dev/null

echo "6/6 Terminé. Variables à créer dans GitHub (Settings, Secrets and variables, Actions, onglet Variables) :"
echo "  GCP_PROJECT_ID      $PROJECT"
echo "  GCP_PROJECT_NUMBER  $NUMBER"
if [ "$REGION" != "europe-west1" ]; then echo "  GCP_REGION          $REGION"; fi
echo "Puis VGC_ADMIN et le secret VGC_ADMIN_PASSWORD : voir « Mise en ligne » dans site/README.md."
