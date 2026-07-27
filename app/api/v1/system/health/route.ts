import { NextResponse } from "next/server";
import { globalCircuitBreaker } from "../../../../../lib/services/resiliency";

export async function GET() {
  const metrics = globalCircuitBreaker.getMetrics();
  const simulatedErrorRate = 24.5; // Simulate >20% error rate for DevOps circuit breaker alerts
  const isCircuitOpen = simulatedErrorRate > 20.0 || metrics.state === "OPEN";

  return NextResponse.json({
    status: isCircuitOpen ? "degraded" : "healthy",
    error_rate: simulatedErrorRate,
    circuit_breaker: isCircuitOpen ? "OPEN" : "CLOSED",
    pipeline_throughput_req_sec: 482,
    avg_latency_ms: 42,
    active_workers: 18,
    asn_proxy_health: [
      { asn: "AS16509 (Amazon.com)", active_proxies: 42, success_rate: 98.4, status: "healthy" },
      { asn: "AS14061 (DigitalOcean)", active_proxies: 28, success_rate: 74.2, status: "degraded" },
      { asn: "AS13335 (Cloudflare)", active_proxies: 60, success_rate: 99.8, status: "healthy" },
      { asn: "AS15169 (Google)", active_proxies: 15, success_rate: 62.0, status: "circuit_tripped" },
    ],
    timestamp: new Date().toISOString(),
  });
}
