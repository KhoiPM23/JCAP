# Multi-stage build for JCAP ASP.NET Core 8 Web API
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file first for dependency caching
COPY JCAP.csproj ./
RUN dotnet restore JCAP.csproj -p:SkipEnsureNpmInstall=true

# Copy remaining backend source (filtered by .dockerignore)
COPY . ./
RUN dotnet publish JCAP.csproj -c Release -o /app/publish --no-restore -p:SkipEnsureNpmInstall=true

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

RUN mkdir -p /app/wwwroot/audio/roleplay /app/wwwroot/audio-cache/voicevox /app/wwwroot/uploads

COPY --from=build /app/publish ./

EXPOSE 8080
ENTRYPOINT ["dotnet", "JCAP.dll"]
