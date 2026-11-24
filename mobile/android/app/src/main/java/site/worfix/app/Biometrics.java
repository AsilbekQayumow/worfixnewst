package site.worfix.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fingerprint / face: the app lock and "sign in with fingerprint". The saved sign-in is encrypted with an
 * Android Keystore key that only opens after a strong biometric check and is destroyed when a new
 * fingerprint is enrolled. Nothing leaves the phone.
 */
public final class Biometrics {
    private static final String KEY = "worfix_login_key";
    private static final String PREFS = "worfix_login";
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    public interface Done { void ok(String value); void fail(String reason); }

    public static String kind(Context c) {
        int r = BiometricManager.from(c).canAuthenticate(AUTH);
        if (r != BiometricManager.BIOMETRIC_SUCCESS) return "none";
        PackageManager pm = c.getPackageManager();
        boolean finger = pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        boolean face = Build.VERSION.SDK_INT >= 29 && pm.hasSystemFeature(PackageManager.FEATURE_FACE);
        if (finger && !face) return "fingerprint";
        if (face && !finger) return "face";
        return finger ? "any" : "fingerprint";
    }

    public static boolean hasLogin(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains("data"); }

    public static void clearLogin(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            ks.deleteEntry(KEY);
        } catch (Exception ignored) { }
    }

    private static SecretKey key(boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY) && !create) return (SecretKey) ks.getKey(KEY, null);
        if (ks.containsAlias(KEY)) ks.deleteEntry(KEY);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        kg.init(b.build());
        return kg.generateKey();
    }

    private static BiometricPrompt.PromptInfo info(String title, String reason, String cancel) {
        return new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title).setSubtitle(reason).setNegativeButtonText(cancel)
            .setAllowedAuthenticators(AUTH).setConfirmationRequired(false).build();
    }

    private static void prompt(FragmentActivity a, BiometricPrompt.PromptInfo info, BiometricPrompt.CryptoObject crypto, BiometricPrompt.AuthenticationCallback cb) {
        a.runOnUiThread(() -> {
            BiometricPrompt p = new BiometricPrompt(a, ContextCompat.getMainExecutor(a), cb);
            if (crypto != null) p.authenticate(info, crypto); else p.authenticate(info);
        });
    }

    /** A plain "is it you?" check (the app lock). */
    public static void verify(FragmentActivity a, String title, String reason, String cancel, Done done) {
        prompt(a, info(title, reason, cancel), null, new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult r) { done.ok("ok"); }
            @Override public void onAuthenticationError(int code, @NonNull CharSequence msg) { done.fail(msg.toString()); }
        });
    }

    public static void saveLogin(FragmentActivity a, String email, String password, String title, String reason, String cancel, Done done) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            prompt(a, info(title, reason, cancel), new BiometricPrompt.CryptoObject(cipher), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult r) {
                    try {
                        Cipher c = r.getCryptoObject().getCipher();
                        JSONObject o = new JSONObject().put("email", email).put("password", password);
                        byte[] enc = c.doFinal(o.toString().getBytes(StandardCharsets.UTF_8));
                        a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                            .putString("data", Base64.encodeToString(enc, Base64.NO_WRAP))
                            .putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP)).apply();
                        done.ok("ok");
                    } catch (Exception e) { done.fail(e.getMessage()); }
                }
                @Override public void onAuthenticationError(int code, @NonNull CharSequence msg) { done.fail(msg.toString()); }
            });
        } catch (Exception e) { done.fail(e.getMessage()); }
    }

    /** Returns the saved sign-in as JSON {email, password}. */
    public static void loadLogin(FragmentActivity a, String title, String reason, String cancel, Done done) {
        SharedPreferences p = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String data = p.getString("data", null), iv = p.getString("iv", null);
        if (data == null || iv == null) { done.fail("none"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            prompt(a, info(title, reason, cancel), new BiometricPrompt.CryptoObject(cipher), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult r) {
                    try {
                        byte[] plain = r.getCryptoObject().getCipher().doFinal(Base64.decode(data, Base64.NO_WRAP));
                        done.ok(new String(plain, StandardCharsets.UTF_8));
                    } catch (Exception e) { done.fail(e.getMessage()); }
                }
                @Override public void onAuthenticationError(int code, @NonNull CharSequence msg) { done.fail(msg.toString()); }
            });
        } catch (KeyPermanentlyInvalidatedException e) {
            clearLogin(a); // a new fingerprint was added: the saved sign-in is gone on purpose
            done.fail("invalidated");
        } catch (Exception e) { done.fail(e.getMessage()); }
    }

    private Biometrics() { }
}
