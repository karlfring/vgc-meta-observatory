#!/usr/bin/env bash
# Prépare un projet Google Cloud pour que GitHub Actions déploie le site sur Cloud Run, sans clé à stocker :
# APIs, dépôt d'images, comptes de service, fédération d'identité GitHub (Workload Identity Federation).
#
# À lancer une seule fois, par exemple dans Cloud Shell (gcloud y est déjà installé et connecté) :
#   git clone https://github.com/karlfring/vgc-meta-observatory && cd vgc-meta-observatory
#   bash site/deploy/setup-gcp.sh <id-du-projet> [région, europe-west1 par défaut]
# Le script peut être relancé sans risque : ce qui existe déjà est conservé.
set -euo pipefail

PROJECT="${1:?Usage : bash site/deploy/setup-gcp.sh <id-du-projet> [région]}"
REGION="${2:-europe-west1}"
REPO="karlfring/vgc-meta-observatory"
DEPLOY="github-deploy@${PROJECT}.iam.gserviceaccount.com"
RUNTIME="vgc-site@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT" >/dev/null
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

echo "1/5 APIs (Cloud Run, Artifact Registry, fédération d'identité)"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

echo "2/5 Dépôt d'images, qui ne garde que les trois dernières"
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

echo "3/5 Comptes de service : vgc-site (exécution, aucun droit) et github-deploy (déploiement)"
gcloud iam service-accounts describe "$RUNTIME" >/dev/null 2>&1 \
  || gcloud iam service-accounts create vgc-site --display-name="Site VGC Meta Overview (exécution)"
gcloud iam service-accounts describe "$DEPLOY" >/dev/null 2>&1 \
  || gcloud iam service-accounts create github-deploy --display-name="Déploiement depuis GitHub Actions"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOY" \
  --role=roles/run.admin --condition=None >/dev/null
gcloud artifacts repositories add-iam-policy-binding vgc --location="$REGION" \
  --member="serviceAccount:$DEPLOY" --role=roles/artifactregistry.writer >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:$DEPLOY" --role=roles/iam.serviceAccountUser >/dev/null

echo "4/5 Fédération d'identité : seul le dépôt $REPO peut se connecter"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
       --display-name="GitHub Actions" --issuer-uri="https://token.actions.githubusercontent.com" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
       --attribute-condition="assertion.repository == '$REPO'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null

echo "5/5 Terminé. Variables à créer dans GitHub (Settings, Secrets and variables, Actions, onglet Variables) :"
echo "  GCP_PROJECT_ID      $PROJECT"
echo "  GCP_PROJECT_NUMBER  $NUMBER"
if [ "$REGION" != "europe-west1" ]; then echo "  GCP_REGION          $REGION"; fi
echo "Puis les comptes et les secrets : voir « Mise en ligne » dans site/README.md."
