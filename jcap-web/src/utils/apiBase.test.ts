import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApiBaseUrl, resolveApiUrl, resolveMediaUrl } from './apiBase.ts';
import { authService } from '../services/authService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '../..');

describe('apiBase self-hosting URL resolution (R3)', () => {
  it('getApiBaseUrl normalizes whitespace and strips trailing slashes', () => {
    assert.equal(getApiBaseUrl(undefined), '');
    assert.equal(getApiBaseUrl(''), '');
    assert.equal(getApiBaseUrl('   '), '');
    assert.equal(getApiBaseUrl('https://api.example.com'), 'https://api.example.com');
    assert.equal(getApiBaseUrl(' https://api.example.com/// '), 'https://api.example.com');
  });

  it('resolveApiUrl works for same-origin and split-origin deployments', () => {
    assert.equal(resolveApiUrl('/api/auth/google', ''), '/api/auth/google');
    assert.equal(resolveApiUrl('api/auth/google', ''), '/api/auth/google');
    assert.equal(
      resolveApiUrl('/api/auth/google', 'https://api.example.com/'),
      'https://api.example.com/api/auth/google'
    );
    assert.equal(
      resolveApiUrl('api/roleplay/sessions/1', 'https://api.example.com/'),
      'https://api.example.com/api/roleplay/sessions/1'
    );
    assert.equal(
      resolveApiUrl('https://other.example.com/api/health', 'https://api.example.com'),
      'https://other.example.com/api/health'
    );
  });

  it('resolveMediaUrl preserves absolute, blob, and data URLs while resolving /audio and /uploads', () => {
    assert.equal(resolveMediaUrl(undefined), undefined);
    assert.equal(resolveMediaUrl(null), undefined);
    assert.equal(resolveMediaUrl('   '), undefined);

    assert.equal(
      resolveMediaUrl('blob:http://localhost:5173/1234-5678', 'https://api.example.com'),
      'blob:http://localhost:5173/1234-5678'
    );
    assert.equal(
      resolveMediaUrl('data:image/png;base64,abc', 'https://api.example.com'),
      'data:image/png;base64,abc'
    );
    assert.equal(
      resolveMediaUrl('https://res.cloudinary.com/demo/image.jpg', 'https://api.example.com'),
      'https://res.cloudinary.com/demo/image.jpg'
    );

    assert.equal(resolveMediaUrl('/audio/roleplay/turn1.wav', ''), '/audio/roleplay/turn1.wav');
    assert.equal(
      resolveMediaUrl('/audio/roleplay/turn1.wav', 'https://api.example.com/'),
      'https://api.example.com/audio/roleplay/turn1.wav'
    );
    assert.equal(
      resolveMediaUrl('/uploads/avatar.png', 'https://api.example.com/'),
      'https://api.example.com/uploads/avatar.png'
    );
  });

  it('authService.getGoogleLoginUrl and authService.ts contain zero hardcoded localhost or dotnet run strings', () => {
    assert.equal(authService.getGoogleLoginUrl(), '/api/auth/google');

    const authSource = fs.readFileSync(path.resolve(webRoot, 'src/services/authService.ts'), 'utf8');
    assert.equal(/localhost:5254/i.test(authSource), false, 'authService must not reference localhost:5254');
    assert.equal(/dotnet run/i.test(authSource), false, 'authService must not reference dotnet run');
  });
});
