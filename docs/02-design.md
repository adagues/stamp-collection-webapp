# Conception

- Application personnelle : un serveur, une collection, sans comptes utilisateurs.
- SQLite conserve les notices, les quantités et les vecteurs liés à la version des modèles.
- Les photos restent dans le navigateur ; seuls les vecteurs sont transmis à la recherche.

```mermaid
flowchart LR
  U[Collectionneur] --> N[Application Next.js]
  N --> M[Modèles dans le navigateur]
  M --> V[MobileNet : vecteurs visuels]
  M --> S[MiniLM : vecteurs sémantiques]
  N --> A[Routes API]
  V --> A
  S --> A
  A --> D[(Base SQLite et index FTS5)]
  I[Import CSV sourcé] --> D
  P[Préparation des images du catalogue] --> M
```

```mermaid
erDiagram
  Stamp ||--o| CollectionEntry : "appartient à"
  Stamp ||--o{ Embedding : "possède"
  Stamp {
    string id PK
    string title
    string country
    int year
    string series
    string denomination
    string image_url
    string source_url
    string catalog_number
    float estimated_value
  }
  CollectionEntry {
    string stamp_id PK,FK
    boolean owned
    int quantity
    string personal_reference
    string updated_at
  }
  Embedding {
    string stamp_id PK,FK
    string kind PK
    string model PK
    string vector_json
  }
```
