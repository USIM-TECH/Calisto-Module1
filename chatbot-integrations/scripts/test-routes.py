import requests

def test_routes():
    # Test GET /products
    try:
        r1 = requests.get('http://localhost:3000/products')
        print("GET /products:", r1.status_code, r1.text[:100])
    except Exception as e:
        print("GET /products failed:", e)

    # Test POST /products/search
    try:
        r2 = requests.post('http://localhost:3000/products/search', json={})
        print("POST /products/search:", r2.status_code)
        print("First product keys:", list(r2.json()[0].keys()) if r2.json() else "Empty list")
    except Exception as e:
        print("POST /products/search failed:", e)

test_routes()
