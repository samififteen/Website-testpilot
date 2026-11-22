"""Form inspection and non-destructive validation testing.

Forms are never submitted. Validation behaviour is exercised in-page with the
browser's own constraint validation API, so no data leaves the browser and no
server-side side effects occur. Password and payment forms are inspected only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from playwright.async_api import Page

EMAIL_TYPES = {"email"}
URL_TYPES = {"url"}
SKIP_TYPES = {"password", "file", "hidden", "submit", "button", "reset", "image"}

VALIDATION_SCRIPT = """
(formIndex) => {
  const forms = Array.from(document.querySelectorAll('form'));
  const form = forms[formIndex];
  if (!form) { return { error: 'form not found' }; }
  const snapshot = (el) => ({
    name: el.getAttribute('name') || el.id || el.getAttribute('placeholder') || el.type,
    type: (el.type || '').toLowerCase(),
    required: !!el.required,
    value: el.value,
  });
  const before = Array.from(form.elements).map(snapshot);
  const requiredFields = Array.from(form.elements)
    .filter((el) => el.willValidate && el.required);
  const emptyRequiredValid = requiredFields.length
    ? requiredFields.every((el) => el.value.trim() !== '' || el.checkValidity())
    : null;
  const formValidWhenEmpty = form.checkValidity();

  const results = { requiredCount: requiredFields.length,
                    formAcceptedEmpty: formValidWhenEmpty,
                    typeChecks: [] };
  for (const el of Array.from(form.elements)) {
    const type = (el.type || '').toLowerCase();
    if (!el.willValidate) continue;
    if (type === 'email') {
      const original = el.value;
      el.value = 'not-an-email';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      results.typeChecks.push({ name: snapshot(el).name, type,
        rejectsInvalid: !el.checkValidity(), message: (el.validationMessage || '').slice(0, 200) });
      el.value = original;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (type === 'url') {
      const original = el.value;
      el.value = 'not a url';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      results.typeChecks.push({ name: snapshot(el).name, type,
        rejectsInvalid: !el.checkValidity(), message: (el.validationMessage || '').slice(0, 200) });
      el.value = original;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  for (let i = 0; i < form.elements.length; i += 1) {
    const el = form.elements[i];
    if (el.willValidate) { try { el.value = before[i].value; } catch (e) {} }
  }
  return results;
}
"""


@dataclass
class FormFinding:
    form_index: int
    classification: str  # safe | inspect_only
    label: str
    field_count: int
    required_count: int
    unlabeled_fields: list[str] = field(default_factory=list)
    has_submit: bool = False
    validation: dict[str, Any] = field(default_factory=dict)
    problems: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def severity(self) -> str:
        if any("accepts an empty submission" in p for p in self.problems):
            return "high"
        if any("rejects" in p or "does not reject" in p for p in self.problems):
            return "medium"
        if self.problems:
            return "low"
        return "info"

    def as_dict(self) -> dict[str, Any]:
        return {
            "form_index": self.form_index,
            "classification": self.classification,
            "label": self.label,
            "field_count": self.field_count,
            "required_count": self.required_count,
            "unlabeled_fields": self.unlabeled_fields,
            "has_submit": self.has_submit,
            "validation": self.validation,
            "problems": self.problems,
            "notes": self.notes,
        }


def _form_label(form: dict[str, Any]) -> str:
    for item in form.get("fields", []):
        if item.get("label"):
            return str(item["label"])[:80]
    action = form.get("action") or form.get("resolved_action") or ""
    return f"Form {form.get('index', 0) + 1}" + (f" → {action[:60]}" if action else "")


async def test_forms(page: Page, forms: list[dict[str, Any]]) -> list[FormFinding]:
    findings: list[FormFinding] = []
    for form in forms[:10]:
        index = int(form.get("index", 0))
        fields = form.get("fields", [])
        finding = FormFinding(
            form_index=index,
            classification="safe",
            label=_form_label(form),
            field_count=len(fields),
            required_count=sum(1 for f in fields if f.get("required")),
            has_submit=bool(form.get("submit_text")),
        )

        finding.unlabeled_fields = [
            (f.get("name") or f.get("type") or "field")
            for f in fields
            if not f.get("label") and not f.get("aria_label") and f.get("type") not in SKIP_TYPES
        ]
        if finding.unlabeled_fields:
            finding.problems.append(
                "Inputs without a label or aria-label: " + ", ".join(finding.unlabeled_fields[:5])
            )
        if not finding.has_submit and form.get("fields"):
            finding.notes.append("No explicit submit control found in this form.")

        if form.get("has_password"):
            finding.classification = "inspect_only"
            finding.notes.append(
                "Password form: inspected only. TestPilot never tries credentials."
            )
            findings.append(finding)
            continue
        if form.get("has_payment"):
            finding.classification = "inspect_only"
            finding.notes.append("Payment form: inspected only. No payment data is entered.")
            findings.append(finding)
            continue

        try:
            result = await page.evaluate(VALIDATION_SCRIPT, index)
        except Exception as exc:
            finding.problems.append(f"Could not run validation checks: {type(exc).__name__}")
            findings.append(finding)
            continue

        if isinstance(result, dict) and result.get("error"):
            finding.notes.append(str(result["error"]))
            findings.append(finding)
            continue
        if not isinstance(result, dict):
            findings.append(finding)
            continue

        finding.validation = result
        required_count = int(result.get("requiredCount", 0) or 0)
        if required_count > 0 and result.get("formAcceptedEmpty"):
            finding.problems.append(
                "The form accepts an empty submission even though it has required fields."
            )
        for check in result.get("typeChecks", []) or []:
            if not check.get("rejectsInvalid"):
                finding.problems.append(
                    f"{check.get('type')} input '{check.get('name')}' "
                    "does not reject an invalid value."
                )
            else:
                finding.notes.append(
                    f"{check.get('type')} input '{check.get('name')}' "
                    "correctly rejects invalid input."
                )
        findings.append(finding)
    return findings
