import base64
from functools import lru_cache
from typing import Literal, Optional

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding

HappCryptoVersion = Literal["v2", "v3", "v4", "v5"]


_HAPP_CRYPTO_CONFIGS = {
    "v2": {
        "deep_link": "happ://crypt2/",
        "public_key": """
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA5cL2yu9dZGnNbs4jt222
NugIqiuZdXKdTh4IgXZmOX0vdpW+rYWrPd1EObQ3Urt+YBTK5Di98EBjYCPr8tus
aVRAn3Vaq41CDisEdX35u1N8jSHQ0zDOtPdrvJtlqShib4UI6Vybk/QSmoZVbpRb
67TNsiFqBmK1kxT+mbtHkhdT2u+hzNLQr0FtJR1+gC+ELKZ48zZY/d3YSSRSb+dx
Und4FH31Kz68VKqlajISSzIrGQWc/zqSlihIvfnTPNX3pCyJpwAuYXieWSRDAogr
wGwoiN++y14OLYHrNlqzoJ44WM3Tbm7x1Dj/8QI3tzwixli/0JmqQ19ssETDbVQ9
0asoPc4QFhyc4c+PH62AdK1S+ysXt5uqEujRBk3rC53l65IOVXSTZgsLwzS7EFY9
lZszJXUJJh5GB9heO8c7PNCTOxno3l4684iHFJuxnkS0DLbdzCXfovwfIP8q3lj7
UJswPKVHkCLNSUutNke+xex1J3YEdvebJzv7Dk78PqLRmLWaEsAhQanXs93aTxEk
d/p7hgFV30QozVQ/oNAvmQSVIBd6zCGM3of3R3tmDkDNGQGrY4MBTX+cTJGYstdh
QXxj1oFZEG16F/0GGXG+sia67gYM3OC7RWyBOzULsEmupIiM8Vdx1iErw7yvJSC4
IsIsWZD8JAmZtLBqEQ/TvfcCAwEAAQ==
-----END PUBLIC KEY-----
""".strip(),
    },
    "v3": {
        "deep_link": "happ://crypt3/",
        "public_key": """
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAlBetA0wjbaj+h7oJ/d/h
pNrXvAcuhOdFGEFcfCxSWyLzWk4SAQ05gtaEGZyetTax2uqagi9HT6lapUSUe2S8
nMLJf5K+LEs9TYrhhBdx/B0BGahA+lPJa7nUwp7WfUmSF4hir+xka5ApHjzkAQn6
cdG6FKtSPgq1rYRPd1jRf2maEHwiP/e/jqdXLPP0SFBjWTMt/joUDgE7v/IGGB0L
Q7mGPAlgmxwUHVqP4bJnZ//5sNLxWMjtYHOYjaV+lixNSfhFM3MdBndjpkmgSfmg
D5uYQYDL29TDk6Eu+xetUEqry8ySPjUbNWdDXCglQWMxDGjaqYXMWgxBA1UKjUBW
wbgr5yKTJ7mTqhlYEC9D5V/LOnKd6pTSvaMxkHXwk8hBWvUNWAxzAf5JZ7EVE3jt
0j682+/hnmL/hymUE44yMG1gCcWvSpB3BTlKoMnl4yrTakmdkbASeFRkN3iMRewa
IenvMhzJh1fq7xwX94otdd5eLB2vRFavrnhOcN2JJAkKTnx9dwQwFpGEkg+8U613
+Tfm/f82l56fFeoFN98dD2mUFLFZoeJ5CG81ZeXrH83niI0joX7rtoAZIPWzq3Y1
Zb/Zq+kK2hSIhphY172Uvs8X2Qp2ac9UoTPM71tURsA9IvPNvUwSIo/aKlX5KE3I
VE0tje7twWXL5Gb1sfcXRzsCAwEAAQ==
-----END PUBLIC KEY-----
""".strip(),
    },
    "v4": {
        "deep_link": "happ://crypt4/",
        "public_key": """
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA3UZ0M3L4K+WjM3vkbQnz
ozHg/cRbEXvQ6i4A8RVN4OM3rK9kU01FdjyoIgywve8OEKsFnVwERZAQZ1Trv60B
hmaM76QQEE+EUlIOL9EpwKWGtTL5lYC1sT9XJMNP3/CI0gP5wwQI88cY/xedpOEB
W72EmOOShHUm/b/3m+HPmqwc4ugKj5zWV5SyiT829aFA5DxSjmIIFBAms7DafmSq
LFTYIQL5cShDY2u+/sqyAw9yZIOoqW2TFIgIHhLPWek/ocDU7zyOrlu1E0SmcQQb
LFqHq02fsnH6IcqTv3N5Adb/CkZDDQ6HvQVBmqbKZKf7ZdXkqsc/Zw27xhG7OfXC
tUmWsiL7zA+KoTd3avyOh93Q9ju4UQsHthL3Gs4vECYOCS9dsXXSHEY/1ngU/hjO
WFF8QEE/rYV6nA4PTyUvo5RsctSQL/9DJX7XNh3zngvif8LsCN2MPvx6X+zLouBX
zgBkQ9DFfZAGLWf9TR7KVjZC/3NsuUCDoAOcpmN8pENBbeB0puiKMMWSvll36+2M
YR1Xs0MgT8Y9TwhE2+TnnTJOhzmHi/BxiUlY/w2E0s4ax9GHAmX0wyF4zeV7kDkc
vHuEdc0d7vDmdw0oqCqWj0Xwq86HfORu6tm1A8uRATjb4SzjTKclKuoElVAVa5Jo
oh/uZMozC65SmDw+N5p6Su8CAwEAAQ==
-----END PUBLIC KEY-----
""".strip(),
    },
}

_HAPP_CRYPTO_V5_API_URL = "https://crypto.happ.su/api-v2.php"
_HAPP_CRYPTO_V5_DEEP_LINK = "happ://crypt5/"


@lru_cache(maxsize=len(_HAPP_CRYPTO_CONFIGS))
def _load_public_key(version: HappCryptoVersion):
    return serialization.load_pem_public_key(
        _HAPP_CRYPTO_CONFIGS[version]["public_key"].encode("utf-8")
    )


def _extract_api_link(response: requests.Response) -> str:
    content_type = (response.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        try:
            data = response.json()
            if isinstance(data, str):
                return data.strip()
            if isinstance(data, dict):
                for key in ("url", "link", "result", "data", "encrypted", "encrypted_link"):
                    value = data.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
        except Exception:
            pass
    return (response.text or "").strip()


def _create_happ_v5_link(content: str) -> Optional[str]:
    response = requests.post(
        _HAPP_CRYPTO_V5_API_URL,
        json={"url": content},
        timeout=12,
    )
    response.raise_for_status()
    encrypted_link = _extract_api_link(response)
    if encrypted_link.startswith(_HAPP_CRYPTO_V5_DEEP_LINK):
        return encrypted_link
    return None


def create_happ_crypto_link(
    content: str,
    version: HappCryptoVersion = "v5",
    as_link: bool = True,
) -> Optional[str]:
    try:
        if version == "v5":
            link = _create_happ_v5_link(content)
            if not link:
                return None
            if as_link:
                return link
            return link.removeprefix(_HAPP_CRYPTO_V5_DEEP_LINK)

        if version not in _HAPP_CRYPTO_CONFIGS:
            return None
        encrypted = _load_public_key(version).encrypt(
            content.encode("utf-8"),
            padding.PKCS1v15(),
        )
        payload = base64.b64encode(encrypted).decode("ascii")
        if as_link:
            return f"{_HAPP_CRYPTO_CONFIGS[version]['deep_link']}{payload}"
        return payload
    except Exception:
        return None
