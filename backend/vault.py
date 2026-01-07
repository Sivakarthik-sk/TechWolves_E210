import json
import os
from cryptography.fernet import Fernet

# --- CONFIGURATION ---
KEY_FILE = "secret.key"
VAULT_FILE = "vault.json"

def load_key():
    """
    Loads the encryption key. If it doesn't exist, generates a new one.
    """
    if not os.path.exists(KEY_FILE):
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as key_file:
            key_file.write(key)
    return open(KEY_FILE, "rb").read()

# Initialize Cipher (Safe Loading)
try:
    cipher = Fernet(load_key())
except Exception as e:
    print(f"⚠️ Key Error: {e}. Regenerating key...")
    if os.path.exists(KEY_FILE):
        os.remove(KEY_FILE)
    cipher = Fernet(load_key())

def load_vault():
    """
    Loads the vault JSON file safely.
    """
    if not os.path.exists(VAULT_FILE):
        return {}
    try:
        with open(VAULT_FILE, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return {}

def save_credential(domain, creds):
    """
    Encrypts and saves credentials for a specific domain.
    """
    vault = load_vault()
    encrypted_data = {}
    
    # Encrypt only non-empty values
    for key, value in creds.items():
        if value:
            encrypted_data[key] = cipher.encrypt(value.encode()).decode()
    
    vault[domain] = encrypted_data
    
    with open(VAULT_FILE, "w") as f:
        json.dump(vault, f, indent=4)
    print(f"🔒 Credentials saved for: {domain}")

def get_credential(domain):
    """
    Retrieves and decrypts credentials for a domain.
    """
    vault = load_vault()
    if domain in vault:
        decrypted = {}
        for key, value in vault[domain].items():
            try:
                decrypted[key] = cipher.decrypt(value.encode()).decode()
            except Exception:
                print(f"⚠️ Failed to decrypt key: {key}")
                pass
        return decrypted
    return None