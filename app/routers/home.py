from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from config import HOME_PAGE_TEMPLATE
from app.templates import render_template

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def base():
    return render_template(HOME_PAGE_TEMPLATE)


@router.get("/exec")
def exec_proxy(url: str, request: Request):
    # Only allow proxying our own subscription URLs to avoid open proxy abuse
    try:
        from urllib.parse import urlparse
        import httpx
        from fastapi import Response, HTTPException

        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise HTTPException(status_code=400, detail="Invalid scheme")

        if not parsed.hostname:
            raise HTTPException(status_code=400, detail="Invalid host")

        host = request.url.hostname
        allowed_hosts = {h for h in [host, "enter.turkmendili.ru"] if h}
        if parsed.hostname not in allowed_hosts:
            raise HTTPException(status_code=403, detail="Host not allowed")

        if parsed.path.startswith("/exec"):
            raise HTTPException(status_code=400, detail="Invalid path")

        if not parsed.path.startswith("/sub/"):
            raise HTTPException(status_code=403, detail="Path not allowed")

        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": request.headers.get("User-Agent", "")})

        # Pass through subscription headers
        headers = {}
        for key in [
            "content-type",
            "profile-title",
            "profile-update-interval",
            "subscription-userinfo",
            "profile-web-page-url",
            "support-url",
            "content-disposition",
        ]:
            if key in resp.headers:
                headers[key] = resp.headers[key]

        return Response(content=resp.content, status_code=resp.status_code, headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
