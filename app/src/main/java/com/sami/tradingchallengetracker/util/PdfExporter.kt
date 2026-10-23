package com.sami.tradingchallengetracker.util

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.sami.tradingchallengetracker.data.ChallengeEntity
import com.sami.tradingchallengetracker.data.TradeEntity
import com.sami.tradingchallengetracker.data.TradeType
import java.io.File
import java.io.FileOutputStream

object PdfExporter {

    fun shareReport(
        context: Context,
        challenge: ChallengeEntity,
        trades: List<TradeEntity>,
        onError: (String) -> Unit = {}
    ) {
        try {
            val pdfDocument = PdfDocument()
            val pageWidth = 595 // A4 standard width in points
            val pageHeight = 842 // A4 standard height in points

            val titlePaint = Paint().apply {
                color = Color.rgb(20, 30, 55)
                textSize = 18f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textAlign = Paint.Align.CENTER
            }

            val subtitlePaint = Paint().apply {
                color = Color.rgb(80, 90, 110)
                textSize = 11f
                textAlign = Paint.Align.CENTER
            }

            val headerPaint = Paint().apply {
                color = Color.rgb(30, 41, 59)
                textSize = 10f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

            val textPaint = Paint().apply {
                color = Color.rgb(51, 65, 85)
                textSize = 9f
            }

            val winPaint = Paint().apply {
                color = Color.rgb(22, 163, 74) // Green
                textSize = 9f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

            val lossPaint = Paint().apply {
                color = Color.rgb(220, 38, 38) // Red
                textSize = 9f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

            val linePaint = Paint().apply {
                color = Color.rgb(226, 232, 240)
                strokeWidth = 1f
            }

            val bgCardPaint = Paint().apply {
                color = Color.rgb(248, 250, 252)
                style = Paint.Style.FILL
            }

            var currentPageNumber = 1
            var pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, currentPageNumber).create()
            var page = pdfDocument.startPage(pageInfo)
            var canvas = page.canvas

            // Page 1 Header
            canvas.drawText("تقرير رحلة التداول - Sami Trading Tracker", (pageWidth / 2).toFloat(), 40f, titlePaint)
            val subText = "المتداول: ${if (challenge.userName.isNotBlank()) challenge.userName else "مستخدم رقم ${challenge.userId}"}  |  تاريخ التقرير: ${Money.formatDateTime(System.currentTimeMillis())}"
            canvas.drawText(subText, (pageWidth / 2).toFloat(), 58f, subtitlePaint)

            // Summary Box
            canvas.drawRoundRect(40f, 75f, (pageWidth - 40).toFloat(), 145f, 8f, 8f, bgCardPaint)
            canvas.drawRoundRect(40f, 75f, (pageWidth - 40).toFloat(), 145f, 8f, 8f, linePaint)

            val summaryY1 = 98f
            val summaryY2 = 126f

            canvas.drawText("الرصيد الابتدائي:", 55f, summaryY1, headerPaint)
            canvas.drawText(Money.format(challenge.initialCapitalCents), 150f, summaryY1, textPaint)

            canvas.drawText("الرصيد الحالي:", 320f, summaryY1, headerPaint)
            val balanceColor = if (challenge.currentBalanceCents >= challenge.initialCapitalCents) winPaint else lossPaint
            canvas.drawText(Money.format(challenge.currentBalanceCents), 410f, summaryY1, balanceColor)

            canvas.drawText("الهدف المطلوب:", 55f, summaryY2, headerPaint)
            canvas.drawText(Money.format(challenge.targetBalanceCents), 150f, summaryY2, textPaint)

            canvas.drawText("إجمالي الصفقات:", 320f, summaryY2, headerPaint)
            canvas.drawText("${trades.size} صفقة", 410f, summaryY2, textPaint)

            // Trades Table Header
            var yPos = 175f
            canvas.drawRect(40f, yPos - 15f, (pageWidth - 40).toFloat(), yPos + 10f, bgCardPaint)
            canvas.drawLine(40f, yPos + 10f, (pageWidth - 40).toFloat(), yPos + 10f, linePaint)

            canvas.drawText("#", 50f, yPos, headerPaint)
            canvas.drawText("النوع", 85f, yPos, headerPaint)
            canvas.drawText("النتيجة", 150f, yPos, headerPaint)
            canvas.drawText("الرصيد الجديد", 260f, yPos, headerPaint)
            canvas.drawText("التاريخ والوقت", 380f, yPos, headerPaint)

            yPos += 25f

            for (trade in trades) {
                if (yPos > pageHeight - 50) {
                    pdfDocument.finishPage(page)
                    currentPageNumber++
                    pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, currentPageNumber).create()
                    page = pdfDocument.startPage(pageInfo)
                    canvas = page.canvas

                    // New Page Header
                    yPos = 40f
                    canvas.drawText("تقرير رحلة التداول - صفحة $currentPageNumber", (pageWidth / 2).toFloat(), yPos, subtitlePaint)
                    yPos += 25f

                    // Re-draw table header
                    canvas.drawRect(40f, yPos - 15f, (pageWidth - 40).toFloat(), yPos + 10f, bgCardPaint)
                    canvas.drawLine(40f, yPos + 10f, (pageWidth - 40).toFloat(), yPos + 10f, linePaint)

                    canvas.drawText("#", 50f, yPos, headerPaint)
                    canvas.drawText("النوع", 85f, yPos, headerPaint)
                    canvas.drawText("النتيجة", 150f, yPos, headerPaint)
                    canvas.drawText("الرصيد الجديد", 260f, yPos, headerPaint)
                    canvas.drawText("التاريخ والوقت", 380f, yPos, headerPaint)

                    yPos += 25f
                }

                val typeLabel = if (trade.type == TradeType.WIN) "ربح (WIN)" else "خسارة (LOSS)"
                val typeStyle = if (trade.type == TradeType.WIN) winPaint else lossPaint

                canvas.drawText("${trade.tradeNumber}", 50f, yPos, textPaint)
                canvas.drawText(typeLabel, 85f, yPos, typeStyle)
                canvas.drawText(Money.format(trade.resultCents, showSign = true), 150f, yPos, typeStyle)
                canvas.drawText(Money.format(trade.newBalanceCents), 260f, yPos, textPaint)
                canvas.drawText(Money.formatDateTime(trade.timestamp), 380f, yPos, textPaint)

                canvas.drawLine(40f, yPos + 6f, (pageWidth - 40).toFloat(), yPos + 6f, linePaint)
                yPos += 20f
            }

            pdfDocument.finishPage(page)

            // Save PDF to cache directory
            val reportsDir = File(context.cacheDir, "pdf_reports")
            if (!reportsDir.exists()) {
                reportsDir.mkdirs()
            }

            val safeChallengeId = challenge.id.replace(Regex("[^a-zA-Z0-9_-]"), "_")
            val pdfFile = File(reportsDir, "sami_report_${safeChallengeId}.pdf")
            val outputStream = FileOutputStream(pdfFile)
            pdfDocument.writeTo(outputStream)
            outputStream.flush()
            outputStream.close()
            pdfDocument.close()

            // Share via Intent
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                pdfFile
            )

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "تقرير رحلة التداول - Sami")
                putExtra(Intent.EXTRA_TEXT, "مرفق تقرير رحلة التداول من تطبيق Sami.")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            val chooser = Intent.createChooser(shareIntent, "مشاركة تقرير PDF").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)

        } catch (e: Exception) {
            onError("تعذر إنشاء ومشاركة ملف PDF: ${e.localizedMessage ?: e.message ?: "خطأ غير متوقع"}")
        }
    }
}
