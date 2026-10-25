# GBAP Stage 3.4 continuation｜Frappe CRM Deactivation Record v1.0

Status: `PASS / DEACTIVATED FROM ACTIVE ENGINEERING + CI / HISTORICAL EVIDENCE RETAINED`

Decision date: 2026-09-01

Project: **GBAP Global Business AI Platform / GBAP**

---

## 1. Decision

Frappe CRM is no longer part of the active GBAP engineering/runtime/CI surface.

Effective state:

```text
Selected active CRM engine = Twenty
Frappe runtime adapter = REMOVED
Frappe real-engine PoU runner = REMOVED
Frappe real-engine GitHub Actions workflow = REMOVED
Frappe automatic CI execution = DISABLED BY REMOVAL
Frappe historical PoU evidence = RETAINED
Frappe current installed alternate = NO
Frappe synchronized standby = NO
Frappe automatic failover = NO
```

The reason is operational simplicity: Frappe is not currently needed and its real-engine PoU has a materially heavier runtime footprint and slower CI execution than the selected Twenty path.

---

## 2. What is deleted from active engineering

The following active implementation/test surfaces are removed:

- `.github/workflows/stage3-4-frappe-real-engine-pou.yml`;
- `providers/frappe-adapter/**`;
- `tests/pou/frappe/**`.

Git history remains sufficient to recover prior implementation if needed, but it is not considered installed or supported current runtime code.

---

## 3. What is deliberately retained

Historical decision and evidence records remain in Git, including:

- Frappe real-engine comparator PoU specification;
- Frappe real-engine comparator PoU PASS record;
- historical machine-readable Frappe evidence under `docs/evidence/stage3-4-frappe/`;
- earlier selection/comparison records that accurately describe what was proven at that time.

These records are historical evidence only. Their presence must not be interpreted as a current installed Frappe provider.

---

## 4. Current replaceability truth

GBAP still retains its provider-neutral architecture and historical proof that another CRM engine can implement the mandatory CRM v1 semantic slice.

However, after this deactivation:

```text
Historical Frappe E1 evidence = RETAINED
Current runnable Frappe adapter = NO
Current Frappe CI = NO
Current Frappe hot standby = NO
Current Frappe failover target = NO
E2 canonical re-import = NOT PROVEN
E3 governed cutover/rollback = NOT PROVEN
```

Therefore no current operational claim may describe Frappe as an immediately available fallback engine.

---

## 5. Future reactivation rule

If Frappe is needed again, do not silently restore old code and claim current support.

Reactivation requires a new governed track:

```text
recover/recreate adapter and PoU assets
→ pin current Frappe version/image identity
→ review licensing/security/runtime topology
→ rerun canonical conformance
→ rerun real-engine/browser PoU as needed
→ record fresh evidence
→ explicitly reactivate provider status
```

Historical PASS evidence may inform that work but is not automatically inherited by a future Frappe version or adapter revision.

---

## 6. Effect on CRM closure

This deactivation does not reopen or weaken the accepted Full CRM Real Wiring closure.

GBAP employee CRM remains implemented against the GBAP-owned canonical/operational boundary with Twenty as the selected headless CRM engine.

Production Go-Live remains separately governed and not authorized by this record.
