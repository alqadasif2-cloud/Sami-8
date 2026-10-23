package com.sami.tradingchallengetracker.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * SamiApiClient - High-Performance, Zero-Cost Cloud Run Client for Android.
 * Communicates directly with Sami Cloud Run REST API, replacing client-side Firebase SDKs.
 * 
 * Benefits:
 * - Zero SDK initialization overhead
 * - Server-side security enforcement for hidden/private channels
 * - Automatic offline fallback & in-memory caching to eliminate black screens/freezes
 * - No hardcoded service credentials or admin keys in APK
 */
object SamiApiClient {

    // Default Cloud Run Production URL or Local Development URL
    private const val PREFS_NAME = "sami_cloud_run_prefs"
    private const val KEY_BASE_URL = "cloud_run_base_url"
    private const val KEY_AUTH_TOKEN = "cloud_run_auth_token"
    private const val KEY_SAVED_USER_ID = "cloud_run_saved_user_id"
    private const val KEY_SAVED_USERNAME = "cloud_run_saved_username"

    // Default to the dedicated Cloud Run deployment or local emulator/network
    var defaultBaseUrl = "https://ais-pre-rodxcm6c62hxrdbgjoqdpr-305360232334.europe-west2.run.app/api"

    private val localMessageCache = ConcurrentHashMap<String, String>()

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getBaseUrl(context: Context): String {
        return getPrefs(context).getString(KEY_BASE_URL, defaultBaseUrl) ?: defaultBaseUrl
    }

    fun setBaseUrl(context: Context, url: String) {
        val clean = url.trim().removeSuffix("/")
        val finalUrl = if (clean.endsWith("/api")) clean else "$clean/api"
        getPrefs(context).edit().putString(KEY_BASE_URL, finalUrl).apply()
    }

    fun getAuthToken(context: Context): String? {
        return getPrefs(context).getString(KEY_AUTH_TOKEN, null)
    }

    fun saveAuthToken(context: Context, token: String, userId: Int, username: String) {
        getPrefs(context).edit()
            .putString(KEY_AUTH_TOKEN, token)
            .putInt(KEY_SAVED_USER_ID, userId)
            .putString(KEY_SAVED_USERNAME, username)
            .apply()
    }

    fun clearAuth(context: Context) {
        getPrefs(context).edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_SAVED_USER_ID)
            .remove(KEY_SAVED_USERNAME)
            .apply()
    }

    // Generic HTTP Request Helper
    private suspend fun sendRequest(
        urlString: String,
        method: String,
        jsonBody: String? = null,
        token: String? = null
    ): Result<String> = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val url = URL(urlString)
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = method
            connection.connectTimeout = 12000
            connection.readTimeout = 15000
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "application/json")

            if (!token.isNullOrEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer $token")
            }

            if (jsonBody != null && (method == "POST" || method == "PUT")) {
                connection.doOutput = true
                OutputStreamWriter(connection.outputStream, "UTF-8").use { writer ->
                    writer.write(jsonBody)
                    writer.flush()
                }
            }

            val responseCode = connection.responseCode
            val inputStream = if (responseCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream ?: connection.inputStream
            }

            val responseText = BufferedReader(InputStreamReader(inputStream, "UTF-8")).use { it.readText() }
            if (responseCode in 200..299) {
                Result.success(responseText)
            } else {
                val errMessage = try {
                    JSONObject(responseText).optString("error", "Error $responseCode")
                } catch (_: Exception) {
                    "Request failed with status $responseCode"
                }
                Result.failure(Exception(errMessage))
            }
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            connection?.disconnect()
        }
    }

    // 1. Health & Config Check
    suspend fun checkHealth(context: Context): Boolean {
        val url = "${getBaseUrl(context)}/health"
        val res = sendRequest(url, "GET")
        return res.isSuccess
    }

    // 2. Authentication Login
    suspend fun login(context: Context, username: String, pass: String): Result<JSONObject> {
        val url = "${getBaseUrl(context)}/auth/login"
        val body = JSONObject().apply {
            put("username", username)
            put("password", pass)
        }.toString()

        val result = sendRequest(url, "POST", body)
        return result.mapCatching { raw ->
            val json = JSONObject(raw)
            val token = json.optString("token")
            val user = json.optJSONObject("user")
            if (token.isNotEmpty() && user != null) {
                saveAuthToken(context, token, user.optInt("id", 0), user.optString("username", username))
            }
            json
        }
    }

    // 3. Guest Login
    suspend fun guestLogin(context: Context, guestName: String): Result<JSONObject> {
        val url = "${getBaseUrl(context)}/auth/guest"
        val body = JSONObject().apply {
            put("guestName", guestName)
        }.toString()

        val result = sendRequest(url, "POST", body)
        return result.mapCatching { raw ->
            val json = JSONObject(raw)
            val token = json.optString("token")
            val user = json.optJSONObject("user")
            if (token.isNotEmpty() && user != null) {
                saveAuthToken(context, token, user.optInt("id", 0), user.optString("username", guestName))
            }
            json
        }
    }

    // 4. Fetch Channels (Server filters hidden channels for members only)
    suspend fun fetchChannels(context: Context): Result<JSONArray> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/channels"
        val result = sendRequest(url, "GET", token = token)
        return result.mapCatching { raw ->
            JSONArray(raw)
        }
    }

    // 5. Fetch Channel Messages
    suspend fun fetchChannelMessages(context: Context, channelId: String, limit: Int = 100): Result<JSONArray> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/channels/$channelId/messages?limit=$limit"
        val cacheKey = "chan_msgs_$channelId"

        val result = sendRequest(url, "GET", token = token)
        return if (result.isSuccess) {
            val raw = result.getOrThrow()
            localMessageCache[cacheKey] = raw
            try {
                Result.success(JSONArray(raw))
            } catch (e: Exception) {
                Result.failure(e)
            }
        } else {
            // Offline fallback
            val cached = localMessageCache[cacheKey]
            if (cached != null) {
                try {
                    Result.success(JSONArray(cached))
                } catch (_: Exception) {
                    result.mapCatching { JSONArray() }
                }
            } else {
                result.mapCatching { JSONArray() }
            }
        }
    }

    // 6. Send Channel Message
    suspend fun sendChannelMessage(
        context: Context,
        channelId: String,
        text: String?,
        imageUrl: String? = null,
        storagePath: String? = null,
        audioUrl: String? = null
    ): Result<JSONObject> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/channels/$channelId/messages"
        val body = JSONObject().apply {
            if (!text.isNullOrBlank()) put("text", text)
            if (!imageUrl.isNullOrBlank()) put("imageUrl", imageUrl)
            if (!storagePath.isNullOrBlank()) put("storagePath", storagePath)
            if (!audioUrl.isNullOrBlank()) put("audioUrl", audioUrl)
        }.toString()

        val result = sendRequest(url, "POST", body, token = token)
        return result.mapCatching { JSONObject(it) }
    }

    // 7. Fetch Private Messages
    suspend fun fetchPrivateMessages(context: Context, otherUserId: Int, limit: Int = 100): Result<JSONArray> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/private-messages?otherUserId=$otherUserId&limit=$limit"
        val cacheKey = "priv_msgs_$otherUserId"

        val result = sendRequest(url, "GET", token = token)
        return if (result.isSuccess) {
            val raw = result.getOrThrow()
            localMessageCache[cacheKey] = raw
            try {
                Result.success(JSONArray(raw))
            } catch (e: Exception) {
                Result.failure(e)
            }
        } else {
            // Offline fallback
            val cached = localMessageCache[cacheKey]
            if (cached != null) {
                try {
                    Result.success(JSONArray(cached))
                } catch (_: Exception) {
                    result.mapCatching { JSONArray() }
                }
            } else {
                result.mapCatching { JSONArray() }
            }
        }
    }

    // 8. Send Private Message
    suspend fun sendPrivateMessage(
        context: Context,
        receiverId: Int,
        text: String?,
        imageUrl: String? = null,
        storagePath: String? = null,
        audioUrl: String? = null
    ): Result<JSONObject> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/private-messages"
        val body = JSONObject().apply {
            put("receiverId", receiverId)
            if (!text.isNullOrBlank()) put("text", text)
            if (!imageUrl.isNullOrBlank()) put("imageUrl", imageUrl)
            if (!storagePath.isNullOrBlank()) put("storagePath", storagePath)
            if (!audioUrl.isNullOrBlank()) put("audioUrl", audioUrl)
        }.toString()

        val result = sendRequest(url, "POST", body, token = token)
        return result.mapCatching { JSONObject(it) }
    }

    // 9. Upload File / Audio / Image to Cloud Run Backend (Google Cloud Storage)
    suspend fun uploadFile(
        context: Context,
        dataBytes: ByteArray,
        mimeType: String,
        filename: String,
        folder: String = "uploads"
    ): Result<JSONObject> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/files/upload"
        val base64Data = Base64.encodeToString(dataBytes, Base64.NO_WRAP)

        val body = JSONObject().apply {
            put("data", base64Data)
            put("mimeType", mimeType)
            put("filename", filename)
            put("folder", folder)
        }.toString()

        val result = sendRequest(url, "POST", body, token = token)
        return result.mapCatching { JSONObject(it) }
    }

    // 10. Fetch Trading Challenge
    suspend fun fetchChallenge(context: Context): Result<JSONObject> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/challenge"
        val result = sendRequest(url, "GET", token = token)
        return result.mapCatching { JSONObject(it) }
    }

    // 11. Save Trading Challenge
    suspend fun saveChallenge(
        context: Context,
        challengeObj: JSONObject,
        tradesArr: JSONArray
    ): Result<JSONObject> {
        val token = getAuthToken(context)
        val url = "${getBaseUrl(context)}/challenge"
        val body = JSONObject().apply {
            put("challenge", challengeObj)
            put("trades", tradesArr)
        }.toString()

        val result = sendRequest(url, "POST", body, token = token)
        return result.mapCatching { JSONObject(it) }
    }

    // 12. Fetch Subscription Packages
    suspend fun fetchPackages(context: Context): Result<JSONArray> {
        val url = "${getBaseUrl(context)}/packages"
        val result = sendRequest(url, "GET")
        return result.mapCatching { JSONArray(it) }
    }
}
