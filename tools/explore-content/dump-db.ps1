# Đọc dữ liệu roadmap (Khám phá) từ SQL Server ra JSON UTF-8. Chỉ đọc, không ghi gì vào database.
# Dùng SqlClient thay vì sqlcmd vì sqlcmd có thể làm hỏng tiếng Việt. Chuỗi kết nối truyền qua biến môi trường JCAP_EXPORT_CONN.
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

$activities = "SELECT a.ActivityType,a.PassThreshold,a.OrderIndex,d.Title AS DialogueTitle,sc.Title AS ScenarioTitle,c.JLPTLevel AS ScenarioLevel FROM ExploreSpotActivities a LEFT JOIN ShadowingDialogues d ON a.ActivityType='Shadowing' AND d.Id=a.ReferenceId LEFT JOIN ScenarioLevelConfigurations c ON a.ActivityType='Roleplay' AND c.Id=a.ReferenceId LEFT JOIN Scenarios sc ON sc.Id=c.ScenarioId WHERE a.LessonId=l.Id ORDER BY a.OrderIndex FOR JSON PATH, INCLUDE_NULL_VALUES"
$queries = @{
  spots       = "SELECT s.Id,s.PrefectureId,s.IconId,s.NameVi,s.NameJp,s.NameKana,s.Latitude,s.Longitude,s.Status,s.IsActive,l.JLPTLevel,l.Situation,l.RealUse,l.SentenceJson,l.Meaning,l.GrammarNote,l.EstimatedMinutes,($activities) AS Activities,(SELECT g.Pattern FROM ExploreSpotLessonGrammars x JOIN Grammars g ON g.Id=x.GrammarId WHERE x.LessonId=l.Id ORDER BY g.Id FOR JSON PATH) AS Grammars,(SELECT v.Word FROM ExploreSpotLessonVocabularies x JOIN Vocabularies v ON v.Id=x.VocabularyId WHERE x.LessonId=l.Id ORDER BY v.Id FOR JSON PATH) AS Vocabularies FROM ExploreSpots s LEFT JOIN ExploreSpotLessons l ON l.SpotId=s.Id ORDER BY s.PrefectureId,s.Id"
  chapters    = "SELECT c.OrderIndex,c.Title,c.Description,c.MinLevel,c.MaxLevel,(SELECT p.PrefectureId FROM ExploreChapterPrefectures p WHERE p.ChapterId=c.Id ORDER BY p.PrefectureId FOR JSON PATH) AS Prefectures FROM ExploreChapters c WHERE c.IsActive=1 ORDER BY c.OrderIndex"
  prefectures = "SELECT Id FROM ExplorePrefectures WHERE IsOpen=1 ORDER BY Id"
  words       = "SELECT PrefectureId,Word,Kana,Meaning,Note,Status FROM ExploreProvinceWords ORDER BY PrefectureId"
  grammars    = "SELECT g.Pattern,g.Reading,g.Meaning,g.Formation,g.Explanation,g.UsageNotes,g.ExampleSentence,g.JLPTLevel FROM Grammars g WHERE g.Id IN (SELECT GrammarId FROM ExploreSpotLessonGrammars) OR g.Id IN (SELECT GrammarId FROM ShadowingDialogueGrammars WHERE ShadowingDialogueId IN (SELECT ReferenceId FROM ExploreSpotActivities WHERE ActivityType='Shadowing')) ORDER BY g.Id"
  vocabs      = "SELECT v.Word,v.Reading,v.Meaning,v.PartOfSpeech,v.JLPTLevel,v.Explanation,v.UsageNotes FROM Vocabularies v WHERE v.Id IN (SELECT VocabularyId FROM ExploreSpotLessonVocabularies) OR v.Id IN (SELECT VocabularyId FROM ShadowingDialogueVocabularies WHERE ShadowingDialogueId IN (SELECT ReferenceId FROM ExploreSpotActivities WHERE ActivityType='Shadowing')) ORDER BY v.Id"
  dialogues   = "SELECT d.Title,s.Title AS ScenarioTitle,d.JLPTLevel,d.SourceDescription,d.SpeakerRoleA_Name,d.SpeakerRoleB_Name,d.SpeakerRolesJson,(SELECT x.OrderIndex,x.SpeakerRole,x.JapaneseText,x.RomajiText,x.VietnameseTranslation,x.AudioDurationMs FROM ShadowingSentences x WHERE x.ShadowingDialogueId=d.Id ORDER BY x.OrderIndex FOR JSON PATH, INCLUDE_NULL_VALUES) AS Sentences,(SELECT v.Word,dv.OrderIndex,dv.Note FROM ShadowingDialogueVocabularies dv JOIN Vocabularies v ON v.Id=dv.VocabularyId WHERE dv.ShadowingDialogueId=d.Id ORDER BY dv.OrderIndex FOR JSON PATH, INCLUDE_NULL_VALUES) AS Vocabularies,(SELECT g.Pattern,dg.OrderIndex,dg.Note FROM ShadowingDialogueGrammars dg JOIN Grammars g ON g.Id=dg.GrammarId WHERE dg.ShadowingDialogueId=d.Id ORDER BY dg.OrderIndex FOR JSON PATH, INCLUDE_NULL_VALUES) AS Grammars FROM ShadowingDialogues d LEFT JOIN Scenarios s ON s.Id=d.ScenarioId WHERE d.Id IN (SELECT ReferenceId FROM ExploreSpotActivities WHERE ActivityType='Shadowing') ORDER BY d.Id"
  scenarios   = "SELECT s.Title,s.Description,s.Thumbnail,(SELECT c.JLPTLevel,c.Title,c.Description,c.AiPersona,c.CreditCost,c.Status,(SELECT m.Content,m.[Order],m.CompletionCriteriaJson,m.IsActive FROM Missions m WHERE m.ScenarioLevelConfigurationId=c.Id ORDER BY m.[Order] FOR JSON PATH, INCLUDE_NULL_VALUES) AS Missions,(SELECT t.Word,t.Reading,t.Meaning FROM TargetVocabularies t WHERE t.ScenarioLevelConfigurationId=c.Id ORDER BY t.Id FOR JSON PATH, INCLUDE_NULL_VALUES) AS TargetVocabularies,(SELECT t.Pattern,t.Meaning,t.ExampleSentence FROM TargetGrammars t WHERE t.ScenarioLevelConfigurationId=c.Id ORDER BY t.Id FOR JSON PATH, INCLUDE_NULL_VALUES) AS TargetGrammars FROM ScenarioLevelConfigurations c WHERE c.ScenarioId=s.Id ORDER BY c.Id FOR JSON PATH, INCLUDE_NULL_VALUES) AS Levels FROM Scenarios s WHERE s.Id IN (SELECT c.ScenarioId FROM ScenarioLevelConfigurations c JOIN ExploreSpotActivities a ON a.ActivityType='Roleplay' AND a.ReferenceId=c.Id) OR s.Id IN (SELECT d.ScenarioId FROM ShadowingDialogues d JOIN ExploreSpotActivities a ON a.ActivityType='Shadowing' AND a.ReferenceId=d.Id) ORDER BY s.Id"
}

$cn = New-Object System.Data.SqlClient.SqlConnection $env:JCAP_EXPORT_CONN
$cn.Open()
try {
  foreach ($name in $queries.Keys) {
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $queries[$name] + " FOR JSON PATH, INCLUDE_NULL_VALUES"
    $reader = $cmd.ExecuteReader()
    $sb = New-Object System.Text.StringBuilder
    while ($reader.Read()) { [void]$sb.Append($reader.GetString(0)) }
    $reader.Close()
    [System.IO.File]::WriteAllText((Join-Path $Out "$name.json"), $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
  }
}
finally { $cn.Close() }
