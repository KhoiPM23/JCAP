import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmailConfirmationReturn,
  isValidStoredUser,
  readStoredAuthSession,
  shouldBypassPublicRouteRedirect,
  shouldClearSessionOnAuthError,
} from './authSession.ts';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    snapshot(): Record<string, string> {
      return Object.fromEntries(map.entries());
    },
  };
}

describe('authSession utilities', () => {
  it('clears zombie jcap_user when jcap_token is missing', () => {
    const storage = createMemoryStorage({
      jcap_user: JSON.stringify({ id: 'u1', email: 'a@b.com', fullName: 'A', role: 'Learner' }),
    });

    const session = readStoredAuthSession(storage);

    assert.equal(session.user, null);
    assert.equal(session.token, null);
    assert.equal(storage.getItem('jcap_user'), null);
  });

  it('drops corrupt or partial jcap_user (e.g. creditBalance-only object) while keeping token for server revalidation', () => {
    const storage = createMemoryStorage({
      jcap_token: 'jwt-abc',
      jcap_user: JSON.stringify({ creditBalance: 0 }),
    });

    const session = readStoredAuthSession(storage);

    assert.equal(session.user, null);
    assert.equal(session.token, 'jwt-abc');
    assert.equal(storage.getItem('jcap_user'), null);
  });

  it('restores valid session when both token and valid user exist', () => {
    const validUser = { id: 'u1', email: 'learner@jcap.vn', fullName: 'Learner', role: 'Learner' };
    const storage = createMemoryStorage({
      jcap_token: 'jwt-valid',
      jcap_user: JSON.stringify(validUser),
    });

    const session = readStoredAuthSession(storage);

    assert.deepEqual(session.user, validUser);
    assert.equal(session.token, 'jwt-valid');
    assert.equal(isValidStoredUser(session.user), true);
  });

  it('clears session on 401/403/404 or not-found auth errors, but preserves session on transient 5xx/network errors', () => {
    assert.equal(shouldClearSessionOnAuthError({ success: false, statusCode: 401, message: 'Unauthorized' }), true);
    assert.equal(shouldClearSessionOnAuthError({ success: false, statusCode: 403, message: 'Forbidden' }), true);
    assert.equal(
      shouldClearSessionOnAuthError({
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy thông tin người dùng.',
      }),
      true
    );
    assert.equal(
      shouldClearSessionOnAuthError({
        success: false,
        message: 'Không tìm thấy thông tin người dùng.',
      }),
      true
    );

    assert.equal(shouldClearSessionOnAuthError({ success: false, statusCode: 503, message: 'Service Unavailable' }), false);
    assert.equal(
      shouldClearSessionOnAuthError({
        success: false,
        message: 'Không thể kết nối đến máy chủ Backend.',
      }),
      false
    );
    assert.equal(shouldClearSessionOnAuthError({ success: true, statusCode: 200, message: 'OK' }), false);
  });

  it('detects email confirmation and password reset flows that should bypass PublicRoute redirect', () => {
    assert.equal(isEmailConfirmationReturn('/login', '?confirmed=true'), true);
    assert.equal(isEmailConfirmationReturn('/login', '?confirmed=false&error=expired'), true);
    assert.equal(isEmailConfirmationReturn('/login', '?error=google_cancelled'), false);
    assert.equal(isEmailConfirmationReturn('/scenarios', '?confirmed=true'), false);

    assert.equal(shouldBypassPublicRouteRedirect('/login', '?confirmed=true'), true);
    assert.equal(shouldBypassPublicRouteRedirect('/login', '?reset=true'), true);
    assert.equal(shouldBypassPublicRouteRedirect('/reset-password', '?token=abc&email=a@b.com'), true);
    assert.equal(shouldBypassPublicRouteRedirect('/login', ''), false);
  });
});
