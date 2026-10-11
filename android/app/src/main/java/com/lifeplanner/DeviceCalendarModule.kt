package com.lifeplanner

import android.content.ContentResolver
import android.content.ContentUris
import android.database.Cursor
import android.net.Uri
import android.provider.CalendarContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceCalendarModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceCalendar"

    @ReactMethod
    fun getEvents(startTimeMs: Double, endTimeMs: Double, promise: Promise) {
        try {
            val startMillis = startTimeMs.toLong()
            val endMillis = if (endTimeMs.toLong() > startMillis) endTimeMs.toLong() else startMillis + 86400000L

            val contentResolver: ContentResolver = reactContext.contentResolver

            // Query CalendarContract.Instances to properly retrieve and expand all recurring events
            val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
            ContentUris.appendId(builder, startMillis)
            ContentUris.appendId(builder, endMillis)
            val uri: Uri = builder.build()

            val projection = arrayOf(
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances._ID,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.DESCRIPTION,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.EVENT_LOCATION,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
                CalendarContract.Instances.CALENDAR_ID
            )
            val selection = "${CalendarContract.Instances.STATUS} != ${CalendarContract.Instances.STATUS_CANCELED}"
            val sortOrder = "${CalendarContract.Instances.BEGIN} ASC"

            val cursor: Cursor? = contentResolver.query(uri, projection, selection, null, sortOrder)
            val eventsArray = Arguments.createArray()

            cursor?.use {
                val eventIdIdx = it.getColumnIndex(CalendarContract.Instances.EVENT_ID)
                val instanceIdIdx = it.getColumnIndex(CalendarContract.Instances._ID)
                val titleIdx = it.getColumnIndex(CalendarContract.Instances.TITLE)
                val descIdx = it.getColumnIndex(CalendarContract.Instances.DESCRIPTION)
                val startIdx = it.getColumnIndex(CalendarContract.Instances.BEGIN)
                val endIdx = it.getColumnIndex(CalendarContract.Instances.END)
                val locIdx = it.getColumnIndex(CalendarContract.Instances.EVENT_LOCATION)
                val allDayIdx = it.getColumnIndex(CalendarContract.Instances.ALL_DAY)
                val calNameIdx = it.getColumnIndex(CalendarContract.Instances.CALENDAR_DISPLAY_NAME)
                val calIdIdx = it.getColumnIndex(CalendarContract.Instances.CALENDAR_ID)

                while (it.moveToNext()) {
                    val map = Arguments.createMap()
                    val eventId = if (eventIdIdx != -1) it.getString(eventIdIdx) ?: "" else ""
                    val instanceId = if (instanceIdIdx != -1) it.getString(instanceIdIdx) ?: "" else ""
                    val uniqueId = if (instanceId.isNotEmpty()) "${eventId}_$instanceId" else eventId

                    val title = if (titleIdx != -1) it.getString(titleIdx) ?: "Untitled Event" else "Untitled Event"
                    val desc = if (descIdx != -1) it.getString(descIdx) ?: "" else ""
                    val start = if (startIdx != -1) it.getLong(startIdx) else 0L

                    var end = if (endIdx != -1) it.getLong(endIdx) else 0L
                    if (end <= start) {
                        end = start + 3600000L // Default to 1 hour if end time is unspecified or zero
                    }

                    val loc = if (locIdx != -1) it.getString(locIdx) ?: "" else ""
                    val allDay = if (allDayIdx != -1) it.getInt(allDayIdx) == 1 else false
                    val calendarName = if (calNameIdx != -1) it.getString(calNameIdx) ?: "" else ""
                    val calendarId = if (calIdIdx != -1) it.getString(calIdIdx) ?: "" else ""

                    map.putString("id", "dev_cal_$uniqueId")
                    map.putString("title", title)
                    map.putString("description", desc)
                    map.putDouble("startTimeMs", start.toDouble())
                    map.putDouble("endTimeMs", end.toDouble())
                    map.putString("location", loc)
                    map.putBoolean("allDay", allDay)
                    map.putString("calendarName", calendarName)
                    map.putString("calendarId", calendarId)
                    eventsArray.pushMap(map)
                }
            }

            promise.resolve(eventsArray)
        } catch (secEx: SecurityException) {
            promise.reject("CALENDAR_PERMISSION_DENIED", "Calendar permission denied by user", secEx)
        } catch (e: Exception) {
            promise.reject("CALENDAR_ERROR", e.message, e)
        }
    }
}
