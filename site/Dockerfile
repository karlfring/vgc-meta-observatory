# Image du site VGC Meta Overview, construite depuis la racine du dépôt :
#   docker build -f site/Dockerfile -t vgc-site .
# Le fichier .dockerignore de la racine ne laisse entrer que ce dont l'image a besoin.

# 1. Compilation du serveur Rust
FROM rust:1.99-slim-trixie AS build
WORKDIR /src
COPY site/Cargo.toml site/Cargo.lock ./
# dépendances compilées à part : cette couche reste en cache tant que Cargo.lock ne change pas
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release --locked && rm -rf src
COPY site/src ./src
RUN touch src/main.rs && cargo build --release --locked

# 2. Image d'exécution minimale : ni shell ni gestionnaire de paquets, utilisateur sans privilèges
FROM gcr.io/distroless/cc-debian13:nonroot
WORKDIR /app
COPY --from=build /src/target/release/vgc-site /app/vgc-site
COPY site/page /app/site/page
COPY site/static /app/site/static
COPY calculateur/dist /app/calculateur/dist
COPY data/dashboard /app/data/dashboard
ENV VGC_ROOT=/app
EXPOSE 8080
ENTRYPOINT ["/app/vgc-site"]
CMD ["serve"]
