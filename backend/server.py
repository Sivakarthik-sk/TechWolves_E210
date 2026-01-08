import uvicorn
import re
import traceback
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup
from difflib import SequenceMatcher

print("🧠 BOOTING CORTEX [OPPENHEIMER V100 - FINAL]")

# 1. OPTIONAL AI
try:
    from sentence_transformers import SentenceTransformer, util
    from deep_translator import GoogleTranslator
    model = SentenceTransformer("all-MiniLM-L6-v2")
    translator = GoogleTranslator(source='auto', target='en')
    print("✅ NEURAL ENGINE: ONLINE")
except:
    model = None
    translator = None
    print("⚠️ NEURAL ENGINE: OFFLINE")

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

class UserQuery(BaseModel):
    query: str
    current_url: str
    html_content: str = ""
    dynamic_credentials: dict = {}
    mode: str = "auto"
    language: str = "en"

class Brain:
    def __init__(self):
        # 🟢 TELEPORTER DATABASE: Bypasses broken menus
        self.direct_links = {
            "irctc.co.in": {
                "lounge": "https://www.irctctourism.com/accommodation",
                "retiring": "https://www.rr.irctctourism.com/",
                "hotel": "https://www.hotels.irctctourism.com/",
                "flight": "https://www.air.irctc.co.in/",
                "bus": "https://www.bus.irctc.co.in/",
                "meal": "https://www.ecatering.irctc.co.in/"
            }
        }
        self.ordinals = {
            "first": 0, "1st": 0, "one": 0, "top": 0,
            "second": 1, "2nd": 1, "two": 1,
            "third": 2, "3rd": 2, "three": 2,
            "fourth": 3, "4th": 3, "last": -1
        }

    def clean_text(self, soup):
        for tag in soup(["script", "style", "noscript", "meta", "iframe", "nav", "footer"]): tag.extract()
        return soup.get_text(separator="\n", strip=True)

    def parse_ordinal(self, query):
        # "Click result 2" -> 1
        words = query.lower().split()
        for w in words:
            if w in self.ordinals: return self.ordinals[w]
        match = re.search(r"(?:result|link|number)\s+(\d+)", query)
        if match: return int(match.group(1)) - 1
        return None

    def check_teleport(self, url, query):
        # Checks if we have a direct link for this intent
        for domain, links in self.direct_links.items():
            if domain in url:
                for key, target_url in links.items():
                    if key in query.lower():
                        return target_url
        return None

brain = Brain()

@app.post("/navigate")
async def navigate(data: UserQuery):
    try:
        soup = BeautifulSoup(data.html_content, "html.parser")
        
        # 1. TRANSLATE
        eng_query = data.query.lower()
        if translator and data.language and "en" not in data.language:
            try: eng_query = translator.translate(data.query).lower()
            except: pass
        
        print(f"🧠 QUERY: {eng_query}")

        # --- CHAT MODE ---
        if data.mode == "chat":
            text = brain.clean_text(soup)
            paragraphs = [p for p in text.split('\n') if len(p) > 40]
            if model and paragraphs:
                scores = util.cos_sim(model.encode(eng_query), model.encode(paragraphs))[0]
                if scores.max() > 0.3:
                    return {"reply": paragraphs[scores.argmax()], "action": "chat_response"}
            return {"reply": "I couldn't find that info here.", "action": "chat_response"}

        # --- NAVIGATION MODE ---
        
        # A. TELEPORTER (IRCTC Fix)
        teleport_url = brain.check_teleport(data.current_url, eng_query)
        if teleport_url:
            return {
                "action": "direct_teleport",
                "url": teleport_url,
                "message": "Teleporting to service..."
            }

        # B. GOOGLE SEARCH (Index Clicker)
        if "google" in data.current_url or "bing" in data.current_url:
            idx = brain.parse_ordinal(eng_query)
            if idx is not None:
                return {
                    "action": "google_click", 
                    "index": idx,
                    "message": f"Opening Result #{idx+1}"
                }

        # C. STANDARD CLICKER
        candidates, texts = [], []
        for el in soup.find_all(["a", "button", "div", "span", "li", "h3", "img", "input"]):
            t = el.get_text(" ", strip=True)
            if el.name == 'input': t = el.get('value') or el.get('placeholder') or ""
            if t and len(t) < 80:
                candidates.append(el)
                texts.append(t)

        target = None
        if model and texts:
            scores = util.cos_sim(model.encode(eng_query), model.encode(texts))[0]
            if scores.max() > 0.28: target = texts[scores.argmax()]
        
        if not target:
            for t in texts:
                if eng_query in t.lower(): target = t; break

        if target:
            return {"action": "spotlight_click", "target_text": target, "message": f"Found: '{target}'"}

        return {"message": "Expanding menus...", "action": "force_expand"}

    except Exception:
        traceback.print_exc()
        return {"action": "speak", "message": "System Error"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)