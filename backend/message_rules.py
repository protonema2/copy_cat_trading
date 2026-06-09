import re
from dataclasses import dataclass
from string import Template
from typing import Optional


@dataclass
class RuleResult:
    output_message: str
    setting_id: Optional[int] = None
    variables: dict[str, str] | None = None


def apply_copy_settings(copy_settings, message: str) -> Optional[RuleResult]:
    for setting in sorted(copy_settings, key=lambda item: item.priority or 0):
        result = apply_copy_setting(setting, message)
        if result:
            return result

    return None


def apply_copy_setting(setting, message: str) -> Optional[RuleResult]:
    filtered_message = (setting.filtered_message or "").strip()
    if not filtered_message:
        return None

    match_type = (setting.match_type or "contains").lower()

    if match_type == "contains":
        if filtered_message.upper() not in message.upper():
            return None
        variables = {"original_message": message}

    elif match_type in {"regex", "regex_multiline"}:
        flags = re.IGNORECASE
        if match_type == "regex_multiline":
            flags = flags | re.DOTALL | re.MULTILINE

        match = re.search(filtered_message, message, flags)
        if not match:
            return None

        variables = {
            "original_message": message,
            **{str(index): value or "" for index, value in enumerate(match.groups(), start=1)},
            **{key: value or "" for key, value in match.groupdict().items()},
        }

    else:
        return None

    output_template = (setting.output_message or "").strip()
    output_message = render_output_template(output_template, filtered_message, variables)
    return RuleResult(
        output_message=output_message,
        setting_id=getattr(setting, "id", None),
        variables=variables,
    )


def render_output_template(output_template: str, fallback_message: str, variables: dict[str, str]) -> str:
    if not output_template:
        return fallback_message

    template = Template(convert_handlebars(output_template))
    return template.safe_substitute(variables)


def convert_handlebars(template: str) -> str:
    return re.sub(r"{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}", r"${\1}", template)
