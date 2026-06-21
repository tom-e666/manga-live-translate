import base64
import io
import json
from http.server import SimpleHTTPRequestHandler, HTTPServer
import sys

# Khoi tao module EasyOCR
easyocr_installed = False
try:
    import easyocr
    from PIL import Image
    easyocr_installed = True
except ImportError:
    print("\n[WARNING] Chua cai dat thu vien OCR. Vui long chay lenh:")
    print("pip install easyocr pillow\n")

readers = {}

def get_reader(lang):
    if not easyocr_installed:
        return None
    if lang not in readers:
        print(f"Khoi tao model OCR cho: {lang} (se tai model neu chay lan dau)...")
        if lang == 'ko':
            readers[lang] = easyocr.Reader(['ko', 'en'])
        elif lang == 'ja':
            readers[lang] = easyocr.Reader(['ja', 'en'])
        elif lang == 'ch':
            readers[lang] = easyocr.Reader(['ch_sim', 'en'])
        else:
            readers[lang] = easyocr.Reader(['en'])
    return readers[lang]

class MangaHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/ocr':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                req_data = json.loads(post_data.decode('utf-8'))
                
                # Giai ma anh base64
                img_data = req_data['image']
                lang = req_data.get('lang', 'en')
                
                if ',' in img_data:
                    img_data = img_data.split(',')[1]
                
                image_bytes = base64.b64decode(img_data)
                image = Image.open(io.BytesIO(image_bytes))
                
                reader_instance = get_reader(lang)
                if reader_instance is None:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Vui long cai dat: pip install easyocr pillow"}).encode())
                    return
                
                # Chay nhan dien chu
                results = reader_instance.readtext(image)
                
                # Định dạng dữ liệu trả về giống cấu trúc ocr.space để frontend dễ xử lý
                lines = []
                for (bbox, text, prob) in results:
                    x0, y0 = bbox[0]
                    x2, y2 = bbox[2]
                    w = x2 - x0
                    h = y2 - y0
                    
                    lines.append({
                        "LineText": text,
                        "Words": [{
                            "Left": int(x0),
                            "Top": int(y0),
                            "Width": int(w),
                            "Height": int(h)
                        }]
                    })
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"Lines": lines}).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    port = 8081
    print(f"Manga Server running at http://localhost:{port}...")
    server = HTTPServer(('0.0.0.0', port), MangaHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
        sys.exit(0)
