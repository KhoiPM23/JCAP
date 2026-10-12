using System.Text.Json.Serialization;

namespace JCAP.DTOs.Tts
{
    public class TtsSynthesizeRequestDto
    {
        public string Text { get; set; } = string.Empty;
        public int SpeakerId { get; set; } = 3; // Mặc định: Zundamon (Normal - ID 3)
    }

    public class VoiceStyleDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("type")]
        public string Type { get; set; } = "talk";
    }

    public class VoiceSpeakerDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("speaker_uuid")]
        public string SpeakerUuid { get; set; } = string.Empty;

        [JsonPropertyName("styles")]
        public List<VoiceStyleDto> Styles { get; set; } = new();

        [JsonPropertyName("version")]
        public string Version { get; set; } = string.Empty;
    }

    public class FlattenedVoiceDto
    {
        public int Id { get; set; }
        public string SpeakerName { get; set; } = string.Empty;
        public string RomajiName { get; set; } = string.Empty;
        public string Gender { get; set; } = "Female"; // "Female", "Male", "Mascot"
        public string Region { get; set; } = string.Empty; // Vùng miền / Tỉnh thành đại diện
        public string Description { get; set; } = string.Empty;
        public string StyleName { get; set; } = string.Empty;
        public string StyleVietnamese { get; set; } = string.Empty;
        public string SpeakerUuid { get; set; } = string.Empty;
        public string DisplayName => $"{SpeakerName} ({RomajiName}) - {StyleVietnamese}";
    }
}

