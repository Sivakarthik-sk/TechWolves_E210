import uvicorn
import re
import traceback
import json
import os
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup

# --- 1. NEURAL CORE ---
print("🧠 BOOTING CORTEX [INTERACTIVE MODE]...")
try:
    from sentence_transformers import SentenceTransformer, util
    from deep_translator import GoogleTranslator
    model = SentenceTransformer('all-MiniLM-L6-v2')
    translator = GoogleTranslator(source='auto', target='en')
    print("✅ NEURAL ENGINE: ONLINE")
except:
    model = None
    print("⚠️ NEURAL ENGINE: OFFLINE")

# --- 2. VAULT (Optional) ---
try:
    from vault import get_credential, save_credential
except:
    def get_credential(d): return {}
    def save_credential(d, c): pass

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class UserQuery(BaseModel):
    query: str
    current_url: str
    html_content: str = ""
    dynamic_credentials: dict = {}
    language: str = "en"

@app.post("/navigate")
async def navigate(data: UserQuery):
    try:
        # SETUP
        raw_query = data.query
        eng_query = raw_query.lower()
        if model and "en" not in data.language:
            try: eng_query = translator.translate(raw_query).lower()
            except: pass

        domain = data.current_url.split("//")[-1].split("/")[0]
        soup = BeautifulSoup(data.html_content, 'html.parser')
        
        print(f"🧠 PROCESSING: {eng_query} (Creds provided: {bool(data.dynamic_credentials)})")
        
        response = {"message": "Processing...", "plan": [], "action": None}

        # 1. EXTRACT DATA FROM PROMPT
        extracted_data = {}
        if "user" in eng_query or "email" in eng_query:
            match = re.search(r"(email|mail|user|id)\s+(?:is|as)?\s+([a-zA-Z0-9@._]+)", eng_query)
            if match: extracted_data["Username"] = match.group(2)
        if "pass" in eng_query:
            match = re.search(r"(pass|password|code)\s+(?:is|as)?\s+([a-zA-Z0-9@._!#]+)", eng_query)
            if match: extracted_data["Password"] = match.group(2)

        # Merge with any credentials passed from the Popup UI
        final_creds = {**extracted_data, **data.dynamic_credentials}

        # 2. LOGIC: LOGIN FLOW
        if "login" in eng_query or "sign in" in eng_query or final_creds:
            
            # A. Check for Visible Inputs
            visible_inputs = [i for i in soup.find_all(['input', 'select']) 
                              if i.get('type') not in ['hidden', 'submit', 'button']]
            
            if visible_inputs:
                # CRITICAL CHANGE: If we lack a password, ASK THE USER
                if not final_creds.get("Password") and not final_creds.get("Username"):
                    return {
                        "action": "ask_credentials", # <--- Triggers Popup
                        "message": "Please enter your credentials.",
                        "plan": [{"step": 1, "action": "Login Form Detected", "status": "done"}]
                    }
                
                # If we HAVE credentials, Fill & Submit
                response["action"] = "secure_autofill"
                response["credentials"] = final_creds
                response["message"] = "Logging in..."
                response["plan"].append({"step": 1, "action": "Credentials Received", "status": "done"})
                response["plan"].append({"step": 2, "action": "Autofill & Submit", "status": "active"})
                
                # Save for future
                save_credential(domain, final_creds)
                return response

            # B. If Inputs Hidden -> Click 'Login' Button first
            else:
                login_btn = None
                for el in soup.find_all(['a', 'button', 'span', 'div']):
                    if el.get_text(" ", strip=True).lower() in ['login', 'sign in', 'log in']:
                        login_btn = el
                        break
                
                if login_btn:
                    # If we have creds, go into Combo Mode
                    if final_creds.get("Password"):
                        response["action"] = "open_and_fill"
                        response["target_text"] = login_btn.get_text(strip=True)
                        response["credentials"] = final_creds
                        response["message"] = "Opening Login..."
                    # If no creds, just click the button, next loop will catch inputs
                    else:
                        response["action"] = "spotlight_click"
                        response["target_text"] = login_btn.get_text(strip=True)
                        response["message"] = "Clicking Login..."

        # 3. LOGIC: NAVIGATION (Default)
        elif not response["action"]:
            candidates, texts = [], []
            for el in soup.find_all(['a', 'button', 'div', 'span', 'li']):
                t = el.get_text(" ", strip=True)
                if t and len(t) < 50:
                    candidates.append(el)
                    texts.append(t)
            
            if candidates and model:
                scores = util.cos_sim(model.encode(eng_query), model.encode(texts))[0]
                if scores.max() > 0.25:
                    target = texts[scores.argmax()]
                    response["action"] = "spotlight_click"
                    response["target_text"] = target
                    response["message"] = f"Clicking '{target}'"

        return response

    except Exception:
        traceback.print_exc()
        return {"action": "speak", "message": "System Error"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)