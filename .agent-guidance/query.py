#!/usr/bin/env python3
"""Look up shared preferences or find relevant guidance without loading the library."""

import argparse
import json
from pathlib import Path, PurePosixPath
import re


class QueryError(Exception):
    pass


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def slug(text: str) -> str:
    return normalize(text).replace(" ", "-")


def contains(text: str, phrase: str) -> bool:
    return f" {normalize(phrase)} " in f" {normalize(text)} "


def library_root() -> Path:
    folder = Path(__file__).resolve().parent
    return folder if (folder / "catalog.json").exists() else folder.parent


def location(root: Path, source: str, line: int) -> str:
    return f"{root / source}:{line}"


def read_source(root: Path, name: str) -> str:
    if not isinstance(name, str) or not name:
        raise QueryError("Source paths must be nonempty strings")
    parts = PurePosixPath(name).parts
    if (not parts or PurePosixPath(name).is_absolute() or ".." in parts
            or "\\" in name or PurePosixPath(name).as_posix() != name):
        raise QueryError(f"Invalid source path: {name}")
    path = root
    for part in parts:
        path = path / part
        if path.is_symlink():
            raise QueryError(f"Source symlink: {name}")
    return path.read_text(encoding="utf-8")


def section(text: str, heading: str, source: str) -> tuple[str, int]:
    lines = text.splitlines()
    found = [(i, len(match[1])) for i, line in enumerate(lines)
             if (match := re.fullmatch(r"(#{1,6}) (.+)", line)) and match[2] == heading]
    if len(found) != 1:
        raise QueryError(f"Expected one heading '{heading}' in {source}")
    start, level = found[0]
    end = next((i for i in range(start + 1, len(lines))
                if (match := re.match(r"^(#{1,6}) ", lines[i])) and len(match[1]) <= level), len(lines))
    return "\n".join(lines[start:end]).strip(), start + 1


def cells(line: str) -> list[str]:
    return [part.strip().replace(r"\|", "|") for part in
            re.split(r"(?<!\\)\|", line.strip().strip("|"))]


def table_rows(text: str, heading: str, source: str) -> list[tuple[list[str], list[str], int]]:
    lines = text.splitlines()
    starts = [i for i, line in enumerate(lines) if line.startswith("|") and cells(line)[0] == heading]
    if len(starts) != 1:
        raise QueryError(f"Expected one table headed '{heading}' in {source}")
    start = starts[0]
    labels = cells(lines[start])
    if len(labels) < 2 or start + 1 >= len(lines) or len(cells(lines[start + 1])) != len(labels) or not all(
            re.fullmatch(r":?-+:?", value) for value in cells(lines[start + 1])):
        raise QueryError(f"Invalid table separator in {source}:{start + 2}")
    rows = []
    for i in range(start + 2, len(lines)):
        if not lines[i].startswith("|"):
            break
        values = cells(lines[i])
        if len(values) != len(labels):
            raise QueryError(f"Invalid table row in {source}:{i + 1}")
        rows.append((labels, values, i + 1))
    return rows


def skill_metadata(text: str, source: str) -> dict[str, str]:
    """Read the scalar discovery fields; leave workflow instructions in SKILL.md."""
    lines = text.splitlines()
    if not lines or lines[0] != "---" or "---" not in lines[1:]:
        raise QueryError(f"Missing skill frontmatter: {source}")
    lines = lines[1:lines.index("---", 1)]
    metadata = {}
    for i, line in enumerate(lines):
        match = re.fullmatch(r"(name|description):\s*(.*)", line)
        if not match:
            continue
        key, value = match.groups()
        if key in metadata:
            raise QueryError(f"Duplicate skill field '{key}': {source}")
        if value in (">", ">-", ">+", "|", "|-", "|+"):
            continuation = []
            for following in lines[i + 1:]:
                if following and not following[0].isspace():
                    break
                continuation.append(following.strip())
            value = " ".join(continuation).strip()
        elif value.startswith('"'):
            value = json.loads(value)
        elif value.startswith("'"):
            if not value.endswith("'") or len(value) < 2:
                raise QueryError(f"Unclosed skill field '{key}': {source}")
            value = value[1:-1].replace("''", "'")
        else:
            continuation = []
            for following in lines[i + 1:]:
                if following and not following[0].isspace():
                    break
                continuation.append(following.strip())
            value = " ".join([value, *continuation]).strip()
        if not isinstance(value, str) or not normalize(value):
            raise QueryError(f"Empty skill field '{key}': {source}")
        metadata[key] = value
    if set(metadata) != {"name", "description"}:
        raise QueryError(f"Missing skill name or description: {source}")
    if len(metadata["name"]) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", metadata["name"]):
        raise QueryError(f"Invalid skill name: {source}")
    return metadata


def load_library(root: Path, include_routes: bool = True) -> tuple[dict, dict, dict]:
    catalog = json.loads(read_source(root, "catalog.json"))
    if not isinstance(catalog, dict) or catalog.get("format") != 1:
        raise QueryError("Unsupported catalog format")
    fields = ("preferences", "routes") if include_routes else ("preferences",)
    if any(not isinstance(catalog.get(field), list) or any(not isinstance(item, dict) for item in catalog[field])
           for field in fields):
        raise QueryError("Catalog preferences and routes must be lists of objects")
    preferences, aliases, routes = {}, {}, {}
    for definition in catalog["preferences"]:
        source = definition["source"]
        text = read_source(root, source)
        prefix = definition.get("prefix", "")
        if (not isinstance(prefix, str) or not isinstance(definition.get("table"), str)
                or any(not isinstance(definition.get(field, {}), dict) for field in ("aliases", "related"))):
            raise QueryError(f"Invalid preference metadata: {source}")
        for labels, values, line in table_rows(text, definition["table"], source):
            key = prefix + slug(values[0])
            if key in preferences:
                raise QueryError(f"Duplicate preference: {key}")
            entry = {"id": key, "title": values[0], "source": location(root, source, line),
                     "fields": dict(zip(labels[1:], values[1:])),
                     "scope": "shared-default",
                     "status": "unset" if values[1].lower() == "unset" else "selected"}
            related = definition.get("related", {})
            heading = related.get(key, related.get("*"))
            if heading:
                content, number = section(text, heading, source)
                entry["context"] = {"source": location(root, source, number), "text": content}
            preferences[key] = entry
        for alias, target in definition.get("aliases", {}).items():
            if not isinstance(target, str) or slug(alias) != alias or alias in aliases:
                raise QueryError(f"Duplicate preference alias: {alias}")
            aliases[alias] = target
    if any(alias in preferences or target not in preferences for alias, target in aliases.items()):
        raise QueryError("A preference alias collides or points to a missing preference")
    if not include_routes:
        return preferences, aliases, routes
    for definition in catalog["routes"]:
        entry = dict(definition)
        key = entry["id"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", key) or key in routes:
            raise QueryError(f"Invalid or duplicate route: {key}")
        if sum(field in entry for field in ("source", "preference", "capability")) != 1:
            raise QueryError(f"Route needs one source, preference or capability: {key}")
        text = read_source(root, entry["source"]) if "source" in entry else ""
        skill = "source" in entry and entry["source"].endswith("/SKILL.md")
        if skill:
            metadata = skill_metadata(text, entry["source"])
            if key != metadata["name"] or "section" in entry:
                raise QueryError(f"Skill route must use its frontmatter name and whole source: {key}")
            entry["when"] = metadata["description"]
        if not isinstance(entry.get("when"), str) or not entry["when"].strip() or not isinstance(entry.get("match"), list) or not entry["match"] or any(
                not isinstance(group, list) or not group or any(not isinstance(term, str) or not normalize(term) for term in group)
                for group in entry["match"]):
            raise QueryError(f"Invalid matching metadata: {key}")
        if (not isinstance(entry.get("kinds", []), list) or any(kind not in ("code", "docs", "design", "review", "choice")
                for kind in entry.get("kinds", [])) or not isinstance(entry.get("exclude", []), list)
                or any(not isinstance(term, str) or not normalize(term) for term in entry.get("exclude", []))):
            raise QueryError(f"Invalid task kinds or exclusions: {key}")
        if "preference" in entry:
            preference = preferences[entry["preference"]]
            entry.update(title=preference["title"], location=preference["source"], kind="preference")
        elif "source" in entry:
            content, line = section(text, entry["section"], entry["source"]) if "section" in entry else (text.strip(), 1)
            entry.update(title=entry.get("section", next((line[2:] for line in text.splitlines() if line.startswith("# ")), key)),
                         location=location(root, entry['source'], line), kind="skill" if skill else "guide", content=content)
        else:
            entry.update(title=entry["capability"], kind="capability", availability="unchecked")
        routes[key] = entry
    for path in sorted((root / "skills").glob("*/SKILL.md")):
        source = path.relative_to(root).as_posix()
        metadata = skill_metadata(read_source(root, source), source)
        key = metadata["name"]
        if key in routes:
            if routes[key].get("source") == source and routes[key]["kind"] == "skill":
                continue
            raise QueryError(f"Duplicate route or skill name: {key}")
        routes[key] = {"id": key, "kind": "skill", "title": key,
                       "when": metadata["description"], "location": location(root, source, 1),
                       "source": source, "content": read_source(root, source).strip()}
    return preferences, aliases, routes


def task_kind(task: str, explicit: str) -> str:
    if explicit != "auto":
        return explicit
    code_task = any(contains(task, term) for term in ("implement", "deploy", "debug", "scaffold", "build")) or (
        any(contains(task, term) for term in ("change", "fix", "add", "remove"))
        and any(contains(task, term) for term in ("binding", "bindings", "schema", "function", "endpoint", "code")))
    if any(contains(task, term) for term in ("readme", "doc", "docs", "documentation", "markdown", "typo", "spelling", "prose", "blog", "essay", "article")) and not code_task:
        return "docs"
    return "code"


def find_routes(routes: dict, task: str, kind: str, limit: int) -> list[dict]:
    results = []
    for entry in routes.values():
        if kind not in entry.get("kinds", ["code", "docs", "design", "review", "choice"]) or any(
                contains(task, term) for term in entry.get("exclude", [])):
            continue
        priority = 0
        if entry["kind"] == "skill" and contains(task, entry["id"]):
            matched = [entry["id"]]
            priority, score = 2, 1
        elif entry["kind"] == "skill" and "match" not in entry:
            # Descriptions are authoritative; tokenize them without maintaining a second skill catalog.
            positive = entry["when"].split(";", 1)[0]
            terms = set(normalize(positive).split()) - {
                "a", "an", "the", "and", "or", "for", "with", "when", "use", "to", "of",
                "is", "it", "this", "that", "requested", "new", "small", "routine"}
            matched = sorted(term for term in terms if contains(task, term))
            if len(matched) < 2 or (kind == "docs" and contains(positive, "code")):
                continue
            priority = -1  # Description-only matches are weaker than curated routes.
            score = len(matched)
        else:
            matched = [next((term for term in group if contains(task, term)), "") for group in entry["match"]]
            if not all(matched):
                continue
            priority = int(entry["kind"] == "skill")
            score = 10 * len(matched) + sum(len(normalize(term).split()) for term in matched)
        result = {field: entry[field] for field in ("id", "kind", "title", "when", "location", "availability") if field in entry}
        result["matched"] = matched
        results.append((priority, score, result))
    return [result for _, _, result in sorted(results, key=lambda item: (-item[0], -item[1], item[2]["id"]))[:limit]]


def print_preference(entry: dict) -> None:
    print(f"{entry['id']} — shared default; project choices take precedence")
    for label, value in entry["fields"].items():
        print(f"{label}: {value}")
    print(f"Source: {entry['source']}")
    if "context" in entry:
        print(f"\n{entry['context']['text']}\nSource: {entry['context']['source']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    pref = commands.add_parser("pref", help="Read a preference from its authoritative table")
    pref.add_argument("key", nargs="?")
    pref.add_argument("--list", action="store_true", help="List exact preference keys")
    find = commands.add_parser("find", help="Return candidates, not an automatic workflow decision")
    find.add_argument("--task")
    find.add_argument("--kind", choices=("auto", "code", "docs", "design", "review", "choice"), default="auto")
    find.add_argument("--limit", type=int, choices=range(1, 11), default=3)
    find.add_argument("--list", action="store_true", help="List guide and skill identifiers")
    read = commands.add_parser("read", help="Read one guide, skill or capability by identifier")
    read.add_argument("id")
    check = commands.add_parser("check", help="Check catalog sources, selectors and skill discovery fields")
    for command in (pref, find, read, check):
        command.add_argument("--json", action="store_true", help="Return structured output")
    args = parser.parse_args()
    if args.command == "pref" and (bool(args.key) == args.list):
        parser.error("pref needs a key or --list")
    if args.command == "find" and (bool(args.task) == args.list):
        parser.error("find needs --task or --list")
    try:
        preferences, aliases, routes = load_library(library_root(), include_routes=args.command != "pref")
        if args.command == "pref":
            key = aliases.get(slug(args.key or ""), slug(args.key or ""))
            if args.list:
                output = [{"id": key, "title": value["title"], "status": value["status"]} for key, value in preferences.items()]
            elif key in preferences:
                output = preferences[key]
            else:
                raise QueryError(f"Unknown preference '{args.key}'; use pref --list")
        elif args.command == "find":
            if args.list:
                output = [{field: entry[field] for field in ("id", "kind", "when")} for entry in routes.values()]
            else:
                output = {"task_kind": task_kind(args.task, args.kind), "matches": find_routes(
                    routes, args.task, task_kind(args.task, args.kind), args.limit)}
        elif args.command == "read":
            if args.id not in routes:
                raise QueryError(f"Unknown guide '{args.id}'; use find --list")
            entry = routes[args.id]
            output = preferences[entry["preference"]] if entry["kind"] == "preference" else {
                key: entry[key] for key in ("id", "kind", "when", "location", "content", "availability", "title") if key in entry}
        else:
            output = {"status": "ok", "preferences": len(preferences), "routes": len(routes)}
        if args.json:
            print(json.dumps(output, indent=2, ensure_ascii=False))
        elif args.command == "check":
            print(f"Catalog OK: {len(preferences)} preferences, {len(routes)} guides, skills and capabilities.")
        elif (args.command == "pref" and not args.list) or (args.command == "read" and "fields" in output):
            print_preference(output)
        elif args.command in ("pref", "find") and args.list:
            for entry in output:
                print(f"{entry['id']}: {entry.get('title', entry.get('when'))}")
        elif args.command == "find":
            if not output["matches"]:
                print("No strong match. Use project context, pref --list or find --list.")
            for entry in output["matches"]:
                print(f"{entry['id']} ({entry['kind']}) — {entry['when']}")
                print(f"  Matched: {', '.join(entry['matched'])}")
                print(f"  Source: {entry['location']}" if "location" in entry else "  Availability unchecked: discover this capability in the host's live skill/tool catalog.")
        elif "content" in output:
            print(f"{output['content']}\n\nSource: {output['location']}")
        else:
            print(f"{output['title']}\n{output['when']}\nAvailability unchecked: use the host's live skill/tool catalog; consult current provider docs if unavailable.")
    except (QueryError, OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f"Lookup stopped: {error}\n")


if __name__ == "__main__":
    main()
