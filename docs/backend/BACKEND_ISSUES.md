# Backend issues found while integrating the frontend

For the backend team. Found while connecting the NIWIS frontend to the backend (October 2026). Each item has the
request, what the frontend expected and what came back, and what the frontend does meanwhile. Reproduce the structural
ones with `npm run contract:check` in the frontend repo (report: `docs/backend/CONTRACT_CHECK.md`).

| #   | Endpoint                                                                                     | Severity                        | Frontend workaround               |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| 1   | `vegetation/timeseries?metric=indices&set=…` ignores `set`                                   | Wrong data on a tab             | Tab shows "Not yet available"     |
| 2   | `drought/table?metric=cascade`: row keys differ from the contract                            | Panel would be blank            | Adapter in `CascadeFlow`          |
| 3   | `climate/table?metric=signal-chain`: row keys differ from the contract                       | Panel would be blank            | Adapter in `CascadeFlow`          |
| 4   | Per-IP rate limit (120 / min) vs. requests per page                                          | 429s for offices behind one NAT | Client backs off on `Retry-After` |
| 5   | `climate/timeseries?metric=indicator-trends`: all-null series without an `unavailable` entry | Minor                           | Hidden, listed as "no values"     |

## 1. `set` is ignored on the vegetation indices series

- **Request:** `GET /api/v1/vegetation/timeseries?metric=indices&set=vci,vhi,tci` (and `set=ndwi,ndii`)
- **Expected:** the requested indices (the mock and the contract return VCI / VHI / TCI, or NDWI / NDII).
- **Actual:** always NDVI, EVI, SAVI, MSAVI2 (with EVI / SAVI / MSAVI2 null), whatever `set` is.
- **Frontend:** the "Condition" and "Water content" tabs on `/vegetation` check that the returned series match the
  requested set and otherwise show "Not yet available" instead of plotting NDVI under a VCI label.
- **Fix:** honour `set` (VCI, VHI, TCI, NDWI are all in `satellite_remote_sensing`; NDII is withheld, so it should be a
  null series with an `unavailable` entry).

## 2. Drought cascade: row keys differ from the contract

- **Request:** `GET /api/v1/drought/table?metric=cascade`
- **Expected (contract / mock):** rows `{stage, metric, value (text), cls, scale, bar}`; `CascadeFlow` reads these keys.
- **Actual:** columns `stage, value (number), class, severity, asOf`; no `metric`, `scale`, `cls` or `bar`.
- **Frontend:** `CascadeFlow` accepts both shapes (`class` → `cls`, `severity` → `bar`, scale per stage from the row id).
- **Fix (optional):** either keep this shape and document it in `CONTRACT_CHANGES.md`, or add the contract's keys.

## 3. Climate signal chain: row keys differ from the contract

- **Request:** `GET /api/v1/climate/table?metric=signal-chain`
- **Expected (contract / mock):** the cascade shape `{stage, metric, value, cls, scale, bar}`.
- **Actual:** `{signal, change, severity}` (severity null, with an `unavailable` entry, which is documented).
- **Frontend:** `CascadeFlow` maps `signal` → stage and `change` → value; the severity pill shows "—".
- **Fix (optional):** as #2.

## 4. Rate limit per IP vs. requests per page

- **Setting:** `RATE_LIMIT_PER_MINUTE=120` per client IP (`app/middleware.py`).
- **Observation:** one visit to `/drought` makes about 45 API requests (KPIs, 13 map layers are fetched on demand, ~25
  charts and tables, tab switches add more); `/rainfall` about 30. Two or three people in one DWS office (one public IP
  behind NAT) opening dashboards in the same minute exceed the limit.
- **Frontend:** on 429 the client waits for `Retry-After` and retries twice, so panels load late rather than fail.
- **Suggestion:** key the limit by user / token once authentication exists, raise it for the DWS network, or exempt
  cached responses.

## 5. All-null series without an `unavailable` entry

- **Request:** `GET /api/v1/climate/timeseries?metric=indicator-trends`
- **Actual:** the "Drought frequency" series is null for every year, and the response has no `unavailable` list.
- **Expected:** per `CONTRACT_CHANGES.md` §3, a null field comes with `unavailable: [{field: "series.drought", reason}]`.
- **Frontend:** hides the series and lists it under the chart as "no values in the database for this selection".

## Not backend bugs (fixed in the frontend)

- `rainfall/timeseries?metric=station` without `entityId` → 400. The frontend sent it before the district list had
  loaded; it now waits for the entity.
