import asyncio
import sys
import time

# Ensure backend_api_engine directory is in sys.path
sys.path.insert(0, r"d:\Code\Project\App Truyen Nova\backend_api_engine")

import httpx
from app.main import app
from app.services.get_aggregator_service import get_aggregator_service if hasattr(__import__('app.services.aggregator', fromlist=['get_aggregator_service']), 'get_aggregator_service') else get_aggregator_service
from tests.test_api import api_mock_handler

async def run_challenges():
    print("==================================================================")
    print("STARTING EMPIRICAL CHALLENGE SUITE FOR MILESTONE 4 API ENDPOINTS")
    print("==================================================================")
    
    aggregator = get_aggregator_service()
    aggregator.clear_cache()
    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(api_mock_handler))
    aggregator.set_client(mock_client)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        results = []

        # Helper function
        async def test_endpoint(name, method, url, expected_status, description, assert_fn=None):
            t0 = time.perf_counter()
            try:
                if method.upper() == "GET":
                    resp = await client.get(url)
                else:
                    resp = await client.post(url)
                elapsed_ms = (time.perf_counter() - t0) * 1000
                
                status_ok = (resp.status_code == expected_status)
                if isinstance(expected_status, list):
                    status_ok = resp.status_code in expected_status

                custom_ok = True
                custom_err = ""
                if status_ok and assert_fn:
                    try:
                        assert_fn(resp)
                    except Exception as err:
                        custom_ok = False
                        custom_err = str(err)

                passed = status_ok and custom_ok
                res_str = "PASS" if passed else "FAIL"
                err_msg = f" (Got status {resp.status_code}, expected {expected_status}. {custom_err})" if not passed else ""
                print(f"[{res_str}] {name} ({elapsed_ms:.2f}ms) - {description}{err_msg}")
                
                results.append({
                    "name": name,
                    "url": url,
                    "expected_status": expected_status,
                    "actual_status": resp.status_code,
                    "passed": passed,
                    "elapsed_ms": elapsed_ms,
                    "details": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text[:200]
                })
                return passed
            except Exception as exc:
                elapsed_ms = (time.perf_counter() - t0) * 1000
                print(f"[FAIL] {name} ({elapsed_ms:.2f}ms) - Exception: {exc}")
                results.append({
                    "name": name,
                    "url": url,
                    "expected_status": expected_status,
                    "actual_status": "EXCEPTION",
                    "passed": False,
                    "elapsed_ms": elapsed_ms,
                    "details": str(exc)
                })
                return False

        print("\n--- 1. MALFORMED INPUT PARAMETERS ---")
        # Endpoint 1: /v1/api/danh-sach/truyen-moi
        await test_endpoint("EP1_Page_Zero", "GET", "/v1/api/danh-sach/truyen-moi?page=0", 422, "page=0 should trigger 422 Validation Error")
        await test_endpoint("EP1_Page_Negative", "GET", "/v1/api/danh-sach/truyen-moi?page=-5", 422, "page=-5 should trigger 422 Validation Error")
        await test_endpoint("EP1_Page_String", "GET", "/v1/api/danh-sach/truyen-moi?page=abc", 422, "page=abc should trigger 422 Validation Error")
        await test_endpoint("EP1_Limit_Zero", "GET", "/v1/api/danh-sach/truyen-moi?limit=0", 422, "limit=0 should trigger 422 Validation Error")
        await test_endpoint("EP1_Limit_Negative", "GET", "/v1/api/danh-sach/truyen-moi?limit=-10", 422, "limit=-10 should trigger 422 Validation Error")
        await test_endpoint("EP1_Limit_Exceed_Max", "GET", "/v1/api/danh-sach/truyen-moi?limit=101", 422, "limit=101 > le=100 should trigger 422 Validation Error")
        await test_endpoint("EP1_Limit_Huge", "GET", "/v1/api/danh-sach/truyen-moi?limit=999999", 422, "limit=999999 should trigger 422 Validation Error")

        # Endpoint 4: /v1/api/truyen-chu/danh-sach
        await test_endpoint("EP4_Page_Zero", "GET", "/v1/api/truyen-chu/danh-sach?page=0", 422, "novel catalog page=0 triggers 422")
        await test_endpoint("EP4_Limit_Over_100", "GET", "/v1/api/truyen-chu/danh-sach?limit=200", 422, "novel catalog limit=200 triggers 422")
        await test_endpoint("EP4_Unknown_Source", "GET", "/v1/api/truyen-chu/danh-sach?source=unknown_xyz", 200, "unknown source should fall back gracefully to default source", lambda r: r.json().get("status") == "success")

        # Endpoint 6: /v1/api/truyen-chu/{slug}/chapter/{chapterNo}
        await test_endpoint("EP6_Invalid_Bool_as_html", "GET", "/v1/api/truyen-chu/overlord/chapter/c1?as_html=not_a_bool", 422, "as_html=invalid triggers 422 Validation Error")

        print("\n--- 2. BOUNDARY VALUES & LARGE PAGE SIZES ---")
        await test_endpoint("EP1_Limit_1", "GET", "/v1/api/danh-sach/truyen-moi?page=1&limit=1", 200, "limit=1 valid minimum boundary")
        await test_endpoint("EP1_Limit_100", "GET", "/v1/api/danh-sach/truyen-moi?page=1&limit=100", 200, "limit=100 valid maximum boundary")
        await test_endpoint("EP4_Limit_100", "GET", "/v1/api/truyen-chu/danh-sach?page=1&limit=100", 200, "novel catalog limit=100 valid maximum boundary")

        print("\n--- 3. NON-EXISTENT SLUGS & CHAPTER IDS ---")
        # Endpoint 2: /v1/api/truyen-tranh/{slug}
        await test_endpoint("EP2_NonExistent_Comic_Slug", "GET", "/v1/api/truyen-tranh/non-existent-slug-xyz", 404, "non-existent comic slug returns 404")
        # Endpoint 3: /v1/api/chapter/{id}
        await test_endpoint("EP3_NonExistent_Chapter_Id", "GET", "/v1/api/chapter/non-existent-ch-id-999", 404, "non-existent comic chapter ID returns 404")
        # Endpoint 5: /v1/api/truyen-chu/{slug}
        await test_endpoint("EP5_NonExistent_Novel_Slug", "GET", "/v1/api/truyen-chu/non-existent-novel-slug", 404, "non-existent novel slug returns 404")
        # Endpoint 6: /v1/api/truyen-chu/{slug}/chapter/{chapterNo}
        await test_endpoint("EP6_NonExistent_Novel_Chapter", "GET", "/v1/api/truyen-chu/overlord/chapter/c9999", 404, "non-existent novel chapter returns 404")
        await test_endpoint("EP6_NonExistent_Novel_and_Chapter", "GET", "/v1/api/truyen-chu/non-existent-novel/chapter/c1", 404, "non-existent novel and chapter returns 404")

        print("\n--- 4. MALFORMED / ADVERSARIAL PATH INPUTS ---")
        await test_endpoint("EP2_Script_Tag_Slug", "GET", "/v1/api/truyen-tranh/<script>alert(1)</script>", 404, "script tag in comic slug handled cleanly with 404")
        await test_endpoint("EP2_Very_Long_Slug", "GET", f"/v1/api/truyen-tranh/{'a'*1000}", 404, "1000-char comic slug handled cleanly with 404")
        await test_endpoint("EP5_Special_Char_Novel_Slug", "GET", "/v1/api/truyen-chu/!@#$%^&*()", 404, "special characters in novel slug return 404")
        await test_endpoint("EP6_Special_Char_Chapter_No", "GET", "/v1/api/truyen-chu/overlord/chapter/../../etc/passwd", 404, "path traversal attempt in chapter_no returns 404")

        print("\n--- 5. HIGH CONCURRENCY & RACE CONDITIONS ---")
        t_conc_start = time.perf_counter()
        concurrent_requests = []
        endpoints_pool = [
            "/v1/api/danh-sach/truyen-moi?page=1&limit=20",
            "/v1/api/truyen-tranh/one-piece",
            "/v1/api/chapter/ch1",
            "/v1/api/truyen-chu/danh-sach?page=1&limit=20&source=hako",
            "/v1/api/truyen-chu/overlord?source=hako",
            "/v1/api/truyen-chu/overlord/chapter/c1?source=hako",
            "/v1/api/truyen-tranh/non-existent-slug",
            "/v1/api/truyen-chu/non-existent-novel",
        ]
        
        # Create 100 concurrent tasks (100 parallel requests)
        for i in range(100):
            target_url = endpoints_pool[i % len(endpoints_pool)]
            concurrent_requests.append(client.get(target_url))

        responses = await asyncio.gather(*concurrent_requests, return_exceptions=True)
        conc_elapsed = (time.perf_counter() - t_conc_start) * 1000
        
        success_count = 0
        expected_status_count = 0
        exceptions_count = 0

        for idx, res in enumerate(responses):
            if isinstance(res, Exception):
                exceptions_count += 1
            else:
                success_count += 1
                target_url = endpoints_pool[idx % len(endpoints_pool)]
                if "non-existent" in target_url:
                    if res.status_code == 404:
                        expected_status_count += 1
                else:
                    if res.status_code == 200:
                        expected_status_count += 1

        conc_passed = (exceptions_count == 0) and (expected_status_count == 100)
        conc_res_str = "PASS" if conc_passed else "FAIL"
        print(f"[{conc_res_str}] EP_CONCURRENCY ({conc_elapsed:.2f}ms total for 100 requests) - Executed 100 concurrent requests across all 6 endpoints.")
        print(f"    Successful HTTP responses: {success_count}/100, Correct status code matching: {expected_status_count}/100, Exceptions: {exceptions_count}")

        results.append({
            "name": "EP_CONCURRENCY",
            "url": "MULTI_ENDPOINT_100_CONCURRENT",
            "expected_status": 200,
            "actual_status": f"{expected_status_count}/100 matched",
            "passed": conc_passed,
            "elapsed_ms": conc_elapsed,
            "details": f"100 tasks executed in {conc_elapsed:.2f}ms. Avg per req: {conc_elapsed/100:.2f}ms"
        })

        print("\n--- 6. SUMMARY REPORT ---")
        total_tests = len(results)
        passed_tests = sum(1 for r in results if r["passed"])
        failed_tests = total_tests - passed_tests
        print(f"Total Tests Executed: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Pass Rate: {(passed_tests / total_tests) * 100:.1f}%")

        if failed_tests > 0:
            print("\nFAILED TEST DETAILS:")
            for r in results:
                if not r["passed"]:
                    print(f" - {r['name']}: {r['details']}")

        return results

if __name__ == "__main__":
    from app.services.aggregator import get_aggregator_service
    asyncio.run(run_challenges())
