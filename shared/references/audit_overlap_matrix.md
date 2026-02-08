# Audit Overlap Matrix: ln-623 vs ln-643

Defines ownership boundaries when both skills detect similar issues.

## Rule of Thumb

- **ln-623** owns **DUPLICATION** issues (same code/pattern repeated)
- **ln-643** owns **ARCHITECTURE BOUNDARY** issues (wrong layer, missing contract)
- When both would fire → owner of the category reports, the other **SKIPs**

## Overlap Matrix

| Issue | ln-623 Reports | ln-643 Reports | Owner |
|-------|----------------|----------------|-------|
| Same DTO shape in 5+ endpoints | DRY 1.7 (duplication) | SKIP | ln-623 |
| No DTO layer at all | SKIP | Missing DTO (architecture) | ln-643 |
| Entity returned from API (ORM leak) | SKIP | Entity Leakage (layer violation) | ln-643 |
| Same mapping logic in 3+ places | DRY 1.10 (duplication) | SKIP | ln-623 |
| Service accepts HTTP types | SKIP | Layer Leakage (contract violation) | ln-643 |
| Same error handling in 3+ services | DRY 1.3 (duplication) | SKIP | ln-623 |
| Mixed error patterns within 1 service | SKIP | Inconsistent Error Contracts | ln-643 |
| Same validation in 3+ endpoints | DRY 1.2 (duplication) | SKIP | ln-623 |
| No validation at service boundary | SKIP | Missing Boundary Validation | ln-643 |
| Redundant method overloads | SKIP | Redundant Overloads (contract) | ln-643 |

## How to Apply

**ln-623 (code-principles-auditor):**
```
IF finding matches "architecture boundary" column → SKIP
Report only DUPLICATION-type findings
```

**ln-643 (api-contract-auditor):**
```
IF finding matches "duplication" column → SKIP
Report only ARCHITECTURE BOUNDARY findings
```

## Edge Cases

| Scenario | Decision |
|----------|----------|
| 3 endpoints use same DTO shape + that DTO leaks ORM fields | ln-623: DRY 1.7; ln-643: Entity Leakage (BOTH report, different angles) |
| Service method has 6 params repeated in 2 methods + accepts Request object | ln-623: SKIP (param grouping is architecture); ln-643: Missing DTO + Layer Leakage |

---
**Version:** 1.0.0
