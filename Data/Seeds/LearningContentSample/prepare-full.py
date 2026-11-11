"""Build a repeatable N5–N3 import bundle from the same pinned sources as sample.json."""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen


LEVELS = (5, 4, 3)
VOCABULARY_TOPICS = (
    ("FOOD", "Ẩm thực và đồ uống", r"food|eat|drink|meal|restaurant|cook|rice|fish|meat|vegetable|fruit|tea|bread|milk|coffee|taste|kitchen"),
    ("TRAVEL", "Giao thông và du lịch", r"train|station|bus|plane|airport|car|road|transport|travel|trip|ticket|hotel|journey|traffic|driver|route|bicycle|flight"),
    ("SHOP", "Mua bán và tiền bạc", r"buy|sell|shop|store|price|money|cost|expensive|cheap|payment|pay|cash|bank|currency|customer|market|goods"),
    ("HEALTH", "Sức khỏe và cơ thể", r"body|doctor|hospital|medicine|health|sick|disease|pain|injury|patient|headache|nurse|treatment|hand|foot|face|eye|ear|nose|mouth"),
    ("SCHOOL", "Trường lớp và học tập", r"school|study|student|teacher|learn|class|exam|university|homework|education|lesson|grade|textbook|teach|library"),
    ("WORK", "Nghề nghiệp và công sở", r"work|job|company|business|office|employee|meeting|manager|factory|industry|occupation|profession|salary|employment|boss|career"),
    ("PEOPLE", "Gia đình và quan hệ", r"family|mother|father|parent|sister|brother|child|friend|wife|husband|daughter|son|grandmother|grandfather|marriage|relative|neighbor"),
    ("HOME", "Nhà cửa và đồ dùng", r"home|house|room|door|window|furniture|bed|chair|table|apartment|floor|roof|household|bathroom|wall|garden"),
    ("CLOTHES", "Trang phục và ngoại hình", r"wear|clothes|clothing|shirt|coat|hat|shoe|sock|dress|skirt|trousers|suit|jacket|uniform|hair|fashion"),
    ("NATURE", "Thiên nhiên và thời tiết", r"weather|rain|snow|wind|sun|mountain|river|sea|ocean|animal|tree|flower|nature|season|temperature|forest|earth|sky|lake|plant"),
    ("LEISURE", "Giải trí và thể thao", r"sport|music|song|game|play|movie|film|art|dance|hobby|sporting|concert|exercise|swim|festival|park|team|competition"),
    ("COMMUNICATION", "Giao tiếp và thông tin", r"say|speak|tell|talk|message|phone|letter|news|information|language|word|write|read|conversation|answer|ask|explain|contact"),
    ("TIME", "Thời gian và lịch trình", r"time|hour|minute|morning|evening|night|day|week|month|year|today|tomorrow|yesterday|schedule|date|calendar"),
    ("FEELINGS", "Cảm xúc và thái độ", r"emotion|feel|happy|sad|anger|worry|love|hate|like|dislike|joy|fear|surprise|regret|hope|mood|anxiety"),
    ("SOCIETY", "Xã hội và đời sống công cộng", r"country|government|law|society|public|politics|war|economy|history|culture|citizen|population|community|city|village"),
    ("LOCATION", "Địa điểm và phương hướng", r"place|location|direction|corner|left|right|east|west|north|south|entrance|exit|street|neighborhood|next to|nearby|opposite|inside|outside|behind|ahead"),
    ("MEASURE", "Số lượng và đo lường", r"number|amount|quantity|measure|weight|length|meter|litre|size|temperature|percent|count|distance|width|height|unit|double|half"),
    ("DAILY", "Hoạt động thường ngày", r"wake up|get up|sleep|wash|bathe|clean|brush|shower|open|close|turn on|turn off|prepare|tidy|laundry|rest|take a break"),
    ("TECH", "Khoa học và kỹ thuật", r"science|technology|machine|computer|electric|electricity|energy|engine|tool|device|data|system|equipment|internet|program|software|research|experiment"),
)
GRAMMAR_TOPICS = (
    ("REQUEST", "Đề nghị và lời yêu cầu", r"request|ask someone|please|suggest|recommend|advice|let us|shall we|invitation|invite"),
    ("PERMISSION", "Cho phép và cấm đoán", r"permission|permitted|allowed|may i|must not|prohibit|forbid|it.s okay|is fine to"),
    ("OBLIGATION", "Nghĩa vụ và sự cần thiết", r"obligation|must|have to|need to|required|necessary|no need|should"),
    ("CONDITION", "Điều kiện và giả định", r"if|unless|provided|suppose|assuming|hypothetical|condition"),
    ("REASON", "Nguyên nhân và hệ quả", r"reason|cause|because|due to|therefore|as a result|consequence|thanks to|owing to"),
    ("PURPOSE", "Mục đích và ý định", r"purpose|intention|intend|in order|so that|plan to|aim|decide"),
    ("TIME", "Trình tự và mốc thời gian", r"before|after|while|during|until|since|as soon|when|time|moment|just did|about to|simultaneous"),
    ("FREQUENCY", "Tần suất và kinh nghiệm", r"frequency|sometimes|often|usually|every time|ever|experience|have done|always|occasionally|habit"),
    ("CHANGE", "Thay đổi và diễn tiến", r"become|change|continue|begin|start|finish|end|gradual|come to|get to|increasing"),
    ("COMPARISON", "So sánh và tương phản", r"compare|comparison|contrast|than|unlike|whereas|difference|most|same as|rather|despite|although"),
    ("INFERENCE", "Suy đoán và truyền đạt", r"probably|seems|looks like|heard|apparently|suppose|inference|guess|hearsay|likelihood|might|certainty|surely"),
    ("ABILITY", "Khả năng và thử làm", r"ability|able|can do|possible|potential|try|attempt|manage"),
    ("EMPHASIS", "Nhấn mạnh và giới hạn", r"emphasis|emphatic|only|merely|even|at least|limit|all|nothing but|except|necessarily"),
    ("GIVING", "Cho nhận và làm giúp", r"give|receive|favor|benefit|for someone"),
    ("POLITENESS", "Lịch sự và kính ngữ", r"honorific|humble|polite|respectful|formal|courteous"),
    ("QUESTIONS", "Hỏi và xác nhận thông tin", r"question|whether|who|where|what|how many|how much|which|confirmation"),
    ("EXISTENCE", "Tồn tại và sở hữu", r"exist|there is|there are|have something|possess|belong|ownership"),
    ("CONNECT", "Liệt kê và nối ý", r"list|example|such as|among|addition|or|and|both|including"),
    ("MODIFICATION", "Bổ nghĩa và diễn đạt đặc điểm", r"modifier|modify|adjective|adverb|manner|quality|similar|like"),
    ("NEGATION", "Phủ định và đính chính", r"negat|not|without|no longer|no |deny"),
)
GRAMMAR_OVERRIDES = {
    "te-kudasai": "REQUEST",
    "temo-ii": "PERMISSION",
    "koto-ga-aru": "FREQUENCY",
    "ta-koto-ga-aru": "FREQUENCY",
    "you-ni-naru": "CHANGE",
    "ni-taishite": "COMPARISON",
    "wake-dewa-nai": "NEGATION",
}


def read_source(cache, source, repo, revision, path):
    file = cache / f"{source}-{Path(path).stem}.json"
    if not file.exists():
        url = f"https://raw.githubusercontent.com/{repo}/{revision}/{path}"
        with urlopen(url, timeout=60) as response:
            payload = response.read()
        json.loads(payload)
        file.write_bytes(payload)
    return json.loads(file.read_text(encoding="utf-8-sig"))


def classify(gloss, topics, default="GENERAL", inflections=False):
    suffix = r"(?:s|es|ed|ing)?" if inflections else ""
    for code, _, words in topics:
        if re.search(r"\b(?:" + words + r")" + suffix + r"\b", gloss, re.I):
            return code
    return default


def vocabulary_group(row, gloss):
    pos = set(row["pos"])
    if pos & {"int", "prt", "conj", "pn", "exp", "aux", "cop", "ctr"}:
        fallback = "EXPRESSIONS"
    elif any(code.startswith(("v1", "v5", "vk", "vs", "vz")) for code in pos):
        fallback = "ACTIONS"
    elif any(code.startswith(("adj", "adv")) for code in pos):
        fallback = "DESCRIPTIONS"
    else:
        fallback = "GENERAL"
    return classify(gloss, VOCABULARY_TOPICS, fallback, inflections=True)


def make_example(japanese, furigana, source, external_id, localized):
    if not furigana or re.sub(r"\{([^|}]+)\|[^}]+\}", r"\1", furigana).strip() != japanese.strip():
        furigana = None
    return {
        "JapaneseText": japanese,
        "VietnameseTranslation": localized.get((external_id, japanese)),
        "Furigana": furigana,
        "SourceKey": source,
        "ExternalId": external_id,
    }


def localized_examples(sample):
    return {(e["ExternalId"], e["JapaneseText"]): e["VietnameseTranslation"] for e in sample.get("Examples", [])}


def prepare(cache):
    sample = json.loads(Path(__file__).with_name("sample.json").read_text(encoding="utf-8-sig"))
    revisions = {row["Key"]: row["Version"] for row in sample["Sources"]}
    vocabulary_samples = {v["ExternalId"]: v for v in sample["Vocabularies"]}
    grammar_samples = {g["ExternalId"]: g for g in sample["Grammars"]}
    vocabulary = []
    grammar = []
    assignments = defaultdict(list)

    for level in LEVELS:
        jlpt = f"N{level}"
        words = read_source(cache, "openjlpt", "evanclan/OpenJLPT", revisions["openjlpt"], f"data/json/vocab/n{level}.json")
        for row in words:
            if row["level"] != jlpt:
                raise ValueError(f"Unexpected vocabulary level: {row['id']}")
            gloss = "; ".join(row["meanings"])
            localized = vocabulary_samples.get(row["id"], {})
            translations = localized_examples(localized)
            examples = [make_example(e["ja"], e.get("furigana"), "tatoeba", str(e["tatoeba_id"]), translations)
                        for e in row.get("examples", [])]
            vocabulary.append({
                "SourceKey": "openjlpt", "ExternalId": row["id"], "Word": row["word"], "Reading": row["reading"],
                "Meaning": localized.get("Meaning", gloss), "PartOfSpeech": localized.get("PartOfSpeech", ", ".join(row["pos"])),
                "JLPTLevel": jlpt, "Explanation": localized.get("Explanation"), "UsageNotes": localized.get("UsageNotes"),
                "Examples": examples,
            })
            assignments[("VOC", jlpt, vocabulary_group(row, gloss))].append(row["id"])

        patterns = read_source(cache, "nihongo-mono", "stndaru/nihongo-mono", revisions["nihongo-mono"], f"src/data/grammar/n{level}.json")
        for row in patterns:
            slug = row["slug"]
            if row["jlpt"] != level:
                raise ValueError(f"Unexpected grammar level: {slug}")
            localized = grammar_samples.get(slug, {})
            translations = localized_examples(localized)
            examples = [make_example(e["ja"], re.sub(r"｜([^\[\]｜]+)\[([^\[\]]+)\]", r"{\1|\2}", e.get("f") or ""),
                                     "nihongo-mono", f"{slug}:example:{i}", translations)
                        for i, e in enumerate(row["examples"], 1)]
            grammar.append({
                "SourceKey": "nihongo-mono", "ExternalId": slug, "Pattern": row["title"], "Reading": row["kana"],
                "Meaning": localized.get("Meaning", row["meaning"]), "Formation": localized.get("Formation", "\n".join(row["structure"])),
                "JLPTLevel": jlpt, "Explanation": localized.get("Explanation", row["summary"]),
                "UsageNotes": localized.get("UsageNotes", "\n".join(row["pitfalls"])), "Examples": examples,
            })
            assignments[("GR", jlpt, GRAMMAR_OVERRIDES.get(slug) or classify(row["meaning"], GRAMMAR_TOPICS))].append(slug)

    vocab_names = {code: name for code, name, _ in VOCABULARY_TOPICS} | {
        "GENERAL": "Sự vật và khái niệm thường gặp",
        "ACTIONS": "Hành động và trạng thái",
        "DESCRIPTIONS": "Miêu tả đặc điểm và mức độ",
        "EXPRESSIONS": "Từ nối và cách nói thông dụng",
    }
    grammar_names = {code: name for code, name, _ in GRAMMAR_TOPICS} | {"GENERAL": "Mẫu câu và cách dùng khác"}
    topics = []
    for (kind, level, category), ids in sorted(assignments.items()):
        is_vocab = kind == "VOC"
        name = (vocab_names if is_vocab else grammar_names)[category]
        unit = "Từ vựng" if is_vocab else "Mẫu ngữ pháp"
        topics.append({
            "Code": f"JLPT_{kind}_{category}_{level}", "Name": name, "JLPTLevel": level,
            "Description": f"{unit} {level} trong nhóm {name.lower()}.",
            "VocabularyIds": ids if is_vocab else [], "GrammarIds": [] if is_vocab else ids,
        })
    return {
        "Dataset": {"Version": "N5-N3-pinned-v1", "Sources": sample["Sources"], "Vocabularies": vocabulary, "Grammars": grammar},
        "Topics": topics,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bundle = prepare(args.output.parent)
    args.output.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(bundle['Dataset']['Vocabularies'])} vocabulary, {len(bundle['Dataset']['Grammars'])} grammar, {len(bundle['Topics'])} topics")


if __name__ == "__main__":
    main()
