#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 <identifier> [signers_file]"
    echo ""
    echo "  identifier    Name for the new tool (alphanumeric, _, -, @, .)"
    echo "  signers_file  Path to the allowed_signers file (default: allowed_signers)"
    echo ""
    echo "Generates an ed25519 SSH key pair and registers the public key."
    echo "The private key is written to <identifier>_key and must be kept secret."
    exit 1
}

if [[ $# -lt 1 ]]; then
    usage
fi

IDENTIFIER="$1"
SIGNERS_FILE="${2:-allowed_signers}"

if [[ ! "$IDENTIFIER" =~ ^[A-Za-z0-9_@.-]+$ ]]; then
    echo "Error: identifier must match [A-Za-z0-9_@.-]+" >&2
    exit 1
fi

PRIVATE_KEY="${IDENTIFIER}_key"
PUBLIC_KEY="${PRIVATE_KEY}.pub"

if [[ -e "$PRIVATE_KEY" || -e "$PUBLIC_KEY" ]]; then
    echo "Error: key files '$PRIVATE_KEY' or '$PUBLIC_KEY' already exist" >&2
    exit 1
fi

if grep -qE "^${IDENTIFIER} " "$SIGNERS_FILE" 2>/dev/null; then
    echo "Error: identifier '${IDENTIFIER}' is already registered in ${SIGNERS_FILE}" >&2
    exit 1
fi

ssh-keygen -t ed25519 -C "$IDENTIFIER" -f "$PRIVATE_KEY" -N ""

read -r keytype pubkey _comment < <(cat "$PUBLIC_KEY")
echo "${IDENTIFIER} ${keytype} ${pubkey}" >> "$SIGNERS_FILE"

echo ""
echo "Done. Registered '${IDENTIFIER}' in ${SIGNERS_FILE}."
echo ""
echo "Private key: ${PRIVATE_KEY} (keep this secret, distribute to the tool's CI)"
echo "Public key:  ${PUBLIC_KEY}"
echo ""