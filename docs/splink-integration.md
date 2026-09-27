# Splink integration

Splink is integrated as an external record-linkage service. DATALINK keeps normalization, tenant isolation, business rules, contradictions, validation, provenance and master-data decisions.

## Service contract

POST /v1/link

Request:
{"left":[...],"right":[...],"settings":{...}}

Response:
{"version":"...","pairs":[{"left_id":"...","right_id":"...","match_probability":0.97,"match_weight":5.2,"cluster_id":"..."}]}

## Migration

The current matcher stays as fallback. Identical normalized PMM/PMB inputs must be compared between engines before promotion. No production switch is performed by this branch.

Configure the Node API with SPLINK_SERVICE_URL pointing to the separately deployed Splink service.
