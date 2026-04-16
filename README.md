# binary-upload-server

A server that accepts signed binary uploads. Each uploaded file must be signed with an SSH key whose public key is registered in the `allowed_signers` file. Files are stored under a versioned directory and a symlink is maintained pointing to the latest upload for each identifier.

## Workflow

1. A client POSTs files and their SSH signatures to `/api/upload`.
2. The server verifies each signature against the `allowed_signers` file using `ssh-keygen -Y verify`.
3. Verified files are moved to `<UPLOAD_PATH>/<directory>/` and a symlink `<identifier>` is created pointing to that directory.

## Setup

```
npm install
# edit as needed
cp .env.example .env
```

### Environment variables (`.env`)

| Variable       | Description                                        | Default        |
|----------------|----------------------------------------------------|----------------|
| `SIGNERS_FILE` | Path to the allowed signers file                   | `allowed_signers` |
| `MULTER_TEMP`  | Temporary directory for incoming uploads           | `uploads`      |
| `UPLOAD_PATH`  | Root directory where verified files are stored     | `archive`      |
| `EXPRESS_HOST`   | Host the server binds to                         | `127.0.0.1`    |
| `EXPRESS_PORT`   | Port the server listens on                       | `3000`         |
| `EXPRESS_PREFIX` | URL prefix for all routes                        | `/api`         |

### Running

```
npm run server
```

## Adding a new tool

Run `addtool.sh` on the server to generate a key pair and register the tool in one step:

```bash
./addtool.sh <identifier> [signers_file]
```

- **identifier** — name for the tool; must match `[A-Za-z0-9_@.-]+`
- **signers_file** — path to the allowed signers file (default: `allowed_signers`)

The script:
1. Generates an `ed25519` key pair (`<identifier>_key` and `<identifier>_key.pub`).
2. Appends the public key to `allowed_signers`.
3. Prints the upload command to use in CI.

Distribute the **private key** (`<identifier>_key`) to the tool's release pipeline and keep it secret. The public key stays on the server in `allowed_signers`.

### Uploading binaries (CI / release side)

```bash
# Sign the binary
ssh-keygen -Y sign -f <identifier>_key -n file <binary>

# Upload
curl -X POST http://127.0.0.1:3000/api/upload \
  -F "file[]=@<binary>" \
  -F "signature[]=@<binary>.sig" \
  -F "identifier=<identifier>" \
  -F "directory=<version>"
```

Repeat `file[]` / `signature[]` pairs to upload multiple files in one request (order must match). After a successful upload the server stores the files at `<UPLOAD_PATH>/<version>/` and updates the symlink `<identifier>` → that directory.

### Request fields

| Field         | Required | Validation              | Description                              |
|---------------|----------|-------------------------|------------------------------------------|
| `file[]`      | yes      | up to 10 files          | Binary files to upload                   |
| `signature[]` | yes      | same count as `file[]`  | SSH signatures, one per file             |
| `identifier`  | yes      | `[A-Za-z0-9_\-@\.]+`   | Must match an entry in `allowed_signers` |
| `directory`   | yes      | `[A-Za-z0-9]+`          | Subdirectory name under `UPLOAD_PATH`    |
