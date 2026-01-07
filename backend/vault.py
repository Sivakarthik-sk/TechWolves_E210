from cryptography.fernet import Fernet
import json
import os

KEY_FILE = "secret.key"
DATA_FILE = "vault.json"

if not os.path.exists(KEY_FILE):
    with open(KEY_FILE, "wb") as kf: kf.write(Fernet.generate_key())

with open(KEY_FILE, "rb") as kf: key = kf.read()
cipher = Fernet(key)

def save_credential(domain, data_dict):
    vault = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r") as f: vault = json.load(f)
        except: pass
    
    encrypted_data = {k: cipher.encrypt(v.encode()).decode() for k, v in data_dict.items()}
    vault[domain] = encrypted_data
    
    with open(DATA_FILE, "w") as f: json.dump(vault, f)
    print(f"🔒 Saved for {domain}")

def get_credential(domain):
    if not os.path.exists(DATA_FILE): return None
    try:
        with open(DATA_FILE, "r") as f: vault = json.load(f)
        if domain in vault:
            return {k: cipher.decrypt(v.encode()).decode() for k, v in vault[domain].items()}
    except: pass
    return None
