using System.Text.Json;

namespace JCAP.Data.Seeds;

/// <summary>Small, versioned development dataset; not an admin import contract.</summary>
public sealed record LearningContentSampleData(
    string Version,
    SampleSource[] Sources,
    SampleVocabulary[] Vocabularies,
    SampleGrammar[] Grammars)
{
    public static LearningContentSampleData Load()
    {
        using var stream = typeof(LearningContentSampleData).Assembly.GetManifestResourceStream(
            "JCAP.Data.Seeds.LearningContentSample.sample.json")
            ?? throw new InvalidOperationException("Learning content sample resource is missing.");
        var data = JsonSerializer.Deserialize<LearningContentSampleData>(stream,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("Learning content sample is empty.");
        data.Validate();
        return data;
    }

    public void Validate()
    {
        static void Required(string? value, int max, string field)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > max)
                throw new InvalidOperationException($"Invalid sample field: {field}.");
        }

        Required(Version, 100, nameof(Version));
        if (Sources.Length == 0 || Vocabularies.Length == 0 || Grammars.Length == 0)
            throw new InvalidOperationException("Sample sources and content must not be empty.");
        if (Sources.Select(s => s.Key).Distinct().Count() != Sources.Length
            || Sources.Select(s => (s.Name, s.Version)).Distinct().Count() != Sources.Length)
            throw new InvalidOperationException("Duplicate source identity in sample.");
        var keys = Sources.Select(s => s.Key).ToHashSet();
        foreach (var source in Sources)
        {
            Required(source.Key, 100, "source key");
            Required(source.Name, 100, "source name");
            Required(source.Version, 100, "source version");
            Required(source.License, 100, "source license");
            Required(source.Attribution, int.MaxValue, "source attribution");
            Required(source.SourceUrl, 1000, "source URL");
            Required(source.LicenseUrl, 1000, "source license URL");
            if (!Uri.IsWellFormedUriString(source.SourceUrl, UriKind.Absolute)
                || !Uri.IsWellFormedUriString(source.LicenseUrl, UriKind.Absolute))
                throw new InvalidOperationException("Invalid source URL.");
        }

        void Content(string sourceKey, string id, string level, string meaning, SampleExample[] examples)
        {
            if (!keys.Contains(sourceKey) || level is not ("N5" or "N4" or "N3"))
                throw new InvalidOperationException("Unknown sample source or JLPT level.");
            Required(id, 200, "external ID");
            Required(meaning, 1000, "meaning");
            if (examples.Length is < 1 or > 2)
                throw new InvalidOperationException("Sample content must have one or two examples.");
            if (examples.Select(e => (e.SourceKey, e.ExternalId)).Distinct().Count() != examples.Length)
                throw new InvalidOperationException("Duplicate example identity.");
            foreach (var example in examples)
            {
                if (!keys.Contains(example.SourceKey))
                    throw new InvalidOperationException("Unknown example source.");
                Required(example.ExternalId, 200, "example external ID");
                Required(example.JapaneseText, 2000, "Japanese example");
                Required(example.VietnameseTranslation, 2000, "Vietnamese example");
                if (example.Furigana?.Length > 4000)
                    throw new InvalidOperationException("Example furigana is too long.");
            }
        }

        if (Vocabularies.Select(v => (v.SourceKey, v.ExternalId)).Distinct().Count() != Vocabularies.Length
            || Grammars.Select(g => (g.SourceKey, g.ExternalId)).Distinct().Count() != Grammars.Length)
            throw new InvalidOperationException("Duplicate content identity in sample.");
        foreach (var vocabulary in Vocabularies)
        {
            Content(vocabulary.SourceKey, vocabulary.ExternalId, vocabulary.JLPTLevel,
                vocabulary.Meaning, vocabulary.Examples);
            Required(vocabulary.Word, 100, "word");
            Required(vocabulary.Reading, 100, "vocabulary reading");
            Required(vocabulary.PartOfSpeech, 100, "part of speech");
            Required(vocabulary.Explanation, int.MaxValue, "vocabulary explanation");
        }
        foreach (var grammar in Grammars)
        {
            Content(grammar.SourceKey, grammar.ExternalId, grammar.JLPTLevel,
                grammar.Meaning, grammar.Examples);
            Required(grammar.Pattern, 100, "grammar pattern");
            Required(grammar.Reading, 200, "grammar reading");
            Required(grammar.Formation, 1000, "grammar formation");
            Required(grammar.Explanation, int.MaxValue, "grammar explanation");
            Required(grammar.Examples[0].JapaneseText, 500, "legacy grammar example");
        }
    }
}

public sealed record SampleSource(string Key, string Name, string Version, string SourceUrl,
    string License, string LicenseUrl, string Attribution);
public sealed record SampleExample(string JapaneseText, string VietnameseTranslation, string? Furigana,
    string SourceKey, string ExternalId);
public sealed record SampleVocabulary(string SourceKey, string ExternalId, string Word, string Reading,
    string Meaning, string PartOfSpeech, string JLPTLevel, string Explanation, string? UsageNotes,
    SampleExample[] Examples);
public sealed record SampleGrammar(string SourceKey, string ExternalId, string Pattern, string Reading,
    string Meaning, string Formation, string JLPTLevel, string Explanation, string? UsageNotes,
    SampleExample[] Examples);
