from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from html import escape
import cgi
import json
import uuid

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / 'uploads'
RECORDS_DIR = BASE_DIR / 'records'
UPLOAD_DIR.mkdir(exist_ok=True)
RECORDS_DIR.mkdir(exist_ok=True)


def render_record_page(record):
    text_value = escape(record.get('text', ''))
    file_name = escape(record.get('file_name', ''))
    file_desc = ''
    if record.get('file_name'):
        file_desc = f'<p><a href="/download/{record["id"]}">Download {file_name}</a></p>'

    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>QR Record</title>
  <style>
    body {{ font-family: Arial, sans-serif; background: #0f172a; color: #e5e7eb; padding: 30px; }}
    .box {{ max-width: 760px; margin: 0 auto; background: #111827; border: 1px solid rgba(148,163,184,.25); border-radius: 16px; padding: 24px; }}
    h1 {{ margin-top: 0; }}
    pre {{ white-space: pre-wrap; word-break: break-word; background: rgba(15,23,42,.9); padding: 18px; border-radius: 12px; }}
    a {{ color: #bbf7d0; }}
  </style>
</head>
<body>
  <div class=\"box\">
    <h1>QR Record: {record['signature']}</h1>
    <p><strong>Signature:</strong> {escape(record.get('signature', ''))}</p>
    {file_desc}
    <p><strong>Text / Notes:</strong></p>
    <pre>{text_value if text_value else 'No text entered.'}</pre>
  </div>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/':
            self.serve_file(BASE_DIR / 'index.html')
            return

        if path.startswith('/record/'):
            record_id = path.split('/')[-1]
            record_file = RECORDS_DIR / f'{record_id}.json'
            if not record_file.exists():
                self.send_error(404, 'Record not found')
                return

            record = json.loads(record_file.read_text(encoding='utf-8'))
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(render_record_page(record).encode('utf-8'))
            return

        if path.startswith('/download/'):
            record_id = path.split('/')[-1]
            record_file = RECORDS_DIR / f'{record_id}.json'
            if not record_file.exists():
                self.send_error(404, 'Record not found')
                return

            record = json.loads(record_file.read_text(encoding='utf-8'))
            file_path = record.get('file_path')
            if not file_path:
                self.send_error(404, 'No file attached to this record')
                return

            file_name = record.get('file_name', 'download.bin')
            with open(file_path, 'rb') as file_obj:
                data = file_obj.read()
            self.send_response(200)
            self.send_header('Content-Type', record.get('mime_type', 'application/octet-stream'))
            self.send_header('Content-Disposition', f'attachment; filename="{file_name}"')
            self.end_headers()
            self.wfile.write(data)
            return

        self.serve_file(BASE_DIR / path.lstrip('/'))

    def do_POST(self):
        if self.path != '/upload':
            self.send_error(404, 'Not found')
            return

        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': self.headers.get('Content-Type', '')}
            )
        except Exception:
            self.send_error(400, 'Invalid upload request')
            return

        signature = form.getvalue('signature', 'D_c0mrade')
        text_value = form.getvalue('text', '')
        uploaded_file = form['file'] if 'file' in form and form['file'].filename else None

        record_id = uuid.uuid4().hex
        record = {
            'id': record_id,
            'signature': signature,
            'text': text_value or '',
            'file_name': '',
            'file_path': '',
            'mime_type': 'application/octet-stream'
        }

        if uploaded_file is not None:
            file_name = uploaded_file.filename
            saved_name = f'{record_id}_{file_name}'
            file_path = UPLOAD_DIR / saved_name
            with open(file_path, 'wb') as out_file:
                out_file.write(uploaded_file.file.read())
            record['file_name'] = file_name
            record['file_path'] = str(file_path)
            record['mime_type'] = uploaded_file.type or 'application/octet-stream'

        record_path = RECORDS_DIR / f'{record_id}.json'
        record_path.write_text(json.dumps(record, ensure_ascii=False), encoding='utf-8')

        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        payload = json.dumps({
            'id': record_id,
            'url': f'http://localhost:8000/record/{record_id}'
        }, ensure_ascii=False).encode('utf-8')
        self.wfile.write(payload)

    def serve_file(self, file_path):
        if file_path.is_dir():
            file_path = file_path / 'index.html'

        if not file_path.exists():
            self.send_error(404, 'File not found')
            return

        mime_map = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        }
        mime_type = mime_map.get(file_path.suffix.lower(), 'application/octet-stream')
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime_type)
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    port = 8000
    print(f'Serving QR app at http://localhost:{port}')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
