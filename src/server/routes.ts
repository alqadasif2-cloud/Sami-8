import { Router } from 'express';
import {
  getUserByUsername,
  getUserById,
  createUserRecord,
  getAllUsersList,
  getUsersCount,
  getChannelsForUser,
  getChannelById,
  getChannelMessages,
  saveChannelMessage,
  getUserChallenge,
  saveUserChallenge,
  getUserTrades,
  addTradeRecord,
  testFirestoreConnection,
  verifyUserPassword,
  projectId,
  databaseId,
  getLatestAppUpdate,
  saveAppUpdateRecord,
  saveFcmToken,
  getTokensForUser,
  getTokensForChannel,
  recordNotificationJob,
} from './db';
import { authenticateToken, requireAuth, requireRole, generateToken } from './auth';
import { saveFile, getFile } from './storage';

export const apiRouter = Router();

// Apply auth token parser to all API routes
apiRouter.use(authenticateToken);

// ==========================================
// 1. HEALTH & DATABASE STATUS (REAL DIAGNOSTICS)
// ==========================================

apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sami-fullstack-server',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

apiRouter.get('/database/status', async (req, res) => {
  const dbStatus = await testFirestoreConnection();
  res.json({
    appName: 'Sami',
    version: '1.3.0',
    platform: 'Google Cloud Node.js Runtime',
    firestore: {
      projectId: dbStatus.projectId,
      databaseId: dbStatus.databaseId,
      isConnected: dbStatus.connected,
      error: dbStatus.error || null,
      errorType: dbStatus.errorType || null,
    },
    storage: {
      targetBucket: `${projectId}-media`,
      freeTierEligible: true,
      freeTierQuota: '5GB standard storage / month',
    },
    auth: {
      jwtMode: process.env.JWT_SECRET ? 'Environment Configured' : 'Ephemeral Secure Generated',
    },
    serverUptimeSeconds: Math.floor(process.uptime()),
  });
});

apiRouter.get('/config', (req, res) => {
  res.json({
    appName: 'Sami',
    version: '1.3.0',
    platform: 'google-cloud-run',
    database: `Cloud Firestore (${databaseId})`,
    storage: 'Google Cloud Storage',
    costTier: 'Free Tier Optimized',
    features: {
      audioMessaging: true,
      fileAttachments: true,
      privateChannels: true,
      tradingChallenge: true,
    },
  });
});

// ==========================================
// 2. AUTHENTICATION & USERS
// ==========================================

apiRouter.post('/auth/register', async (req, res) => {
  try {
    const { username, displayName, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام' });
    }

    const cleanUser = String(username).trim();
    const existing = await getUserByUsername(cleanUser);

    if (existing) {
      return res.status(400).json({ error: 'اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم آخر' });
    }

    const role = cleanUser.toLowerCase() === 'sami' ? 'owner' : 'user';

    const newUser = await createUserRecord({
      username: cleanUser,
      displayName: String(displayName || cleanUser).trim(),
      password: String(password),
      role,
    });

    const token = generateToken({
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
      avatarUrl: newUser.avatarUrl,
      isGuest: false,
    });

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'حدث خطأ أثناء التسجيل: ' + (err?.message || err) });
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    const user = await getUserByUsername(String(username).trim());
    if (!user) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const valid = verifyUserPassword(String(password), user.passwordHash, user.salt);
    if (!valid) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isGuest: false,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول: ' + (err?.message || err) });
  }
});

apiRouter.post('/auth/guest', (req, res) => {
  const guestName = req.body.guestName?.trim() || `ضيف_${Math.floor(Math.random() * 9000 + 1000)}`;
  const guestId = Math.floor(Date.now() / 1000);

  const token = generateToken({
    id: guestId,
    username: `guest_${guestId}`,
    displayName: guestName,
    role: 'guest',
    avatarUrl: null,
    isGuest: true,
  });

  res.json({
    success: true,
    token,
    user: {
      id: guestId,
      username: `guest_${guestId}`,
      displayName: guestName,
      role: 'guest',
      isGuest: true,
    },
  });
});

apiRouter.get('/auth/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.user!.id);
  if (!user && !req.user!.isGuest) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  res.json({
    success: true,
    user: user
      ? {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: user.avatarUrl,
          warningsCount: user.warningsCount,
        }
      : req.user,
  });
});

apiRouter.get('/users', requireAuth, async (req, res) => {
  const users = await getAllUsersList();
  res.json({ success: true, users });
});

// ==========================================
// 3. CHANNELS & PERMISSIONS (RBAC)
// ==========================================

apiRouter.get('/channels', requireAuth, async (req, res) => {
  const user = req.user!;
  const channels = await getChannelsForUser(user.id, user.role);
  res.json({ success: true, channels });
});

apiRouter.get('/channels/:id', requireAuth, async (req, res) => {
  const channelId = req.params.id;
  const user = req.user!;
  const channel = await getChannelById(channelId);

  if (!channel) {
    return res.status(404).json({ error: 'القناة غير موجودة' });
  }

  // Enforce zero-trust access:
  if (channel.visibility === 'hidden' && user.role !== 'owner') {
    const isAllowed = channel.allowedMemberIds?.includes(user.id) || channel.memberIds?.includes(user.id);
    if (!isAllowed) {
      return res.status(403).json({ error: 'ليس لديك صلاحية للوصول إلى هذه القناة الخاصة' });
    }
  }

  res.json({ success: true, channel });
});

// ==========================================
// 4. MESSAGES (PERSISTENT IN FIRESTORE/DISK)
// ==========================================

apiRouter.get('/channels/:id/messages', requireAuth, async (req, res) => {
  const channelId = req.params.id;
  const user = req.user!;
  const channel = await getChannelById(channelId);

  if (!channel) {
    return res.status(404).json({ error: 'القناة غير موجودة' });
  }

  if (channel.visibility === 'hidden' && user.role !== 'owner') {
    const isAllowed = channel.allowedMemberIds?.includes(user.id) || channel.memberIds?.includes(user.id);
    if (!isAllowed) {
      return res.status(403).json({ error: 'غير مصرح لك بعرض رسائل هذه القناة' });
    }
  }

  const limitCount = parseInt(req.query.limit as string, 10) || 80;
  const messages = await getChannelMessages(channelId, limitCount);
  res.json({ success: true, messages });
});

apiRouter.post('/channels/:id/messages', requireAuth, async (req, res) => {
  try {
    const channelId = req.params.id;
    const user = req.user!;
    const channel = await getChannelById(channelId);

    if (!channel) {
      return res.status(404).json({ error: 'القناة غير موجودة' });
    }

    if (channel.visibility === 'hidden' && user.role !== 'owner') {
      const isAllowed = channel.allowedMemberIds?.includes(user.id) || channel.memberIds?.includes(user.id);
      if (!isAllowed) {
        return res.status(403).json({ error: 'غير مصرح لك بالإرسال في هذه القناة' });
      }
    }

    const { text, fileUrl, fileName, fileSize, fileType, audioUrl, audioDuration, replyToId } = req.body;

    if (!text && !fileUrl && !audioUrl) {
      return res.status(400).json({ error: 'محتوى الرسالة مطلوب' });
    }

    const now = Date.now();
    const messageId = `msg_${now}_${user.id}_${Math.random().toString(36).substring(2, 7)}`;

    const newMsg = {
      id: messageId,
      channelId,
      senderId: user.id,
      senderName: user.displayName,
      senderRole: user.role,
      senderAvatarUrl: user.avatarUrl || null,
      text: text ? String(text).trim() : undefined,
      fileUrl: fileUrl || undefined,
      fileName: fileName || undefined,
      fileSize: fileSize || undefined,
      fileType: fileType || undefined,
      audioUrl: audioUrl || undefined,
      audioDuration: audioDuration || undefined,
      replyToId: replyToId || null,
      isDeleted: false,
      timestamp: now,
    };

    await saveChannelMessage(newMsg);

    // Dispatch Push Notification to all channel members
    try {
      const tokens = await getTokensForChannel(channelId, user.id);
      if (tokens.length > 0) {
        const title = channel.name;
        const bodySnippet = newMsg.text || (newMsg.audioUrl ? '🎤 رسالة صوتية جديدة' : '📷 مرفق جديد');
        const notifJob = {
          id: `job_${now}_${Math.random().toString(36).substring(2, 7)}`,
          targetUserIds: channel.memberIds || [],
          title,
          body: `${user.displayName}: ${bodySnippet}`,
          data: {
            channelId,
            chatType: 'channel',
            messageId: newMsg.id,
            senderName: user.displayName,
          },
          createdAt: now,
        };
        void recordNotificationJob(notifJob);
      }
    } catch (e) {
      console.warn('[Notif] Error dispatching channel notification job:', e);
    }

    res.json({ success: true, message: newMsg });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال الرسالة: ' + (err?.message || err) });
  }
});

// ==========================================
// 5. TRADING CHALLENGE & 150 MILESTONES
// ==========================================

apiRouter.get('/challenge', requireAuth, async (req, res) => {
  const user = req.user!;
  const challenge = await getUserChallenge(user.id, user.displayName);
  res.json({ success: true, challenge });
});

apiRouter.post('/challenge/reset', requireAuth, async (req, res) => {
  const user = req.user!;
  const initialCapitalCents = parseInt(req.body.initialCapitalCents, 10) || 10000;

  const challenge = await getUserChallenge(user.id, user.displayName);
  challenge.initialCapitalCents = initialCapitalCents;
  challenge.currentBalanceCents = initialCapitalCents;
  challenge.tradeCount = 0;
  challenge.challengeStarted = false;
  challenge.updatedAt = Date.now();

  await saveUserChallenge(challenge);
  res.json({ success: true, challenge });
});

apiRouter.get('/challenge/trades', requireAuth, async (req, res) => {
  const user = req.user!;
  const trades = await getUserTrades(user.id);
  res.json({ success: true, trades });
});

apiRouter.post('/challenge/trades', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { resultCents, type, attachmentPath } = req.body;

    const parsedResult = parseInt(resultCents, 10);
    if (isNaN(parsedResult)) {
      return res.status(400).json({ error: 'قيمة الصفقة غير صحيحة' });
    }

    const challenge = await getUserChallenge(user.id, user.displayName);
    const oldBalance = challenge.currentBalanceCents;
    const newBalance = oldBalance + parsedResult;
    const newTradeCount = challenge.tradeCount + 1;

    challenge.currentBalanceCents = newBalance;
    challenge.tradeCount = newTradeCount;
    challenge.challengeStarted = true;
    challenge.updatedAt = Date.now();

    const now = Date.now();
    const newTrade = {
      id: `trade_${now}_${user.id}_${newTradeCount}`,
      challengeId: challenge.id,
      userId: user.id,
      tradeNumber: newTradeCount,
      resultCents: parsedResult,
      oldBalanceCents: oldBalance,
      newBalanceCents: newBalance,
      type: type === 'LOSS' || parsedResult < 0 ? ('LOSS' as const) : ('WIN' as const),
      attachmentPath: attachmentPath || null,
      timestamp: now,
    };

    await addTradeRecord(user.id, newTrade, challenge);

    res.json({
      success: true,
      trade: newTrade,
      challenge,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تسجيل الصفقة: ' + (err?.message || err) });
  }
});

// ==========================================
// 6. FILE ATTACHMENTS & UPLOADS
// ==========================================

apiRouter.post('/files/upload', requireAuth, async (req, res) => {
  try {
    const rawFileName = req.body.fileName || req.body.filename;
    const rawFileData = req.body.fileData || req.body.data;
    const mimeType = req.body.mimeType || 'application/octet-stream';
    const folder = req.body.folder || 'chat_files';

    if (!rawFileName || !rawFileData) {
      return res.status(400).json({ error: 'الملف وبياناته مطلوبة' });
    }

    const fileName = String(rawFileName);
    const fileData = String(rawFileData);

    const base64Content = fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData;
    const buffer = Buffer.from(base64Content, 'base64');

    if (buffer.length > 26214400) {
      return res.status(400).json({ error: 'حجم الملف يتجاوز الحد الأقصى المسموح (25 ميغابايت)' });
    }

    const targetFolder = ['chat_images', 'chat_files', 'chat_audio', 'avatars'].includes(folder)
      ? (folder as any)
      : 'chat_files';

    const saved = await saveFile(
      String(fileName),
      buffer,
      String(mimeType || 'application/octet-stream'),
      req.user!.id,
      targetFolder
    );

    res.json({
      success: true,
      fileUrl: saved.fileUrl,
      fileName: saved.fileName,
      fileSize: saved.fileSize,
      fileType: saved.fileType,
      storagePath: saved.storagePath,
      isCloudStorage: saved.isCloudStorage,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفع الملف: ' + (err?.message || err) });
  }
});

apiRouter.get('/files/:id', async (req, res) => {
  const fileId = req.params.id;
  const result = await getFile(fileId);

  if (!result) {
    return res.status(404).send('File not found');
  }

  const mimeType = result.file.fileType || 'application/octet-stream';
  const totalLength = result.buffer.length;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.file.fileName)}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

    if (start >= totalLength || end >= totalLength) {
      res.status(416).setHeader('Content-Range', `bytes */${totalLength}`).end();
      return;
    }

    const chunk = result.buffer.subarray(start, end + 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
    res.setHeader('Content-Length', chunk.length);
    res.send(chunk);
    return;
  }

  res.setHeader('Content-Length', totalLength);
  res.send(result.buffer);
});

// ==========================================
// 7. PRIVATE MESSAGES
// ==========================================

apiRouter.get('/private-messages', requireAuth, async (req, res) => {
  const otherUserId = parseInt(req.query.otherUserId as string, 10);
  if (!otherUserId) {
    return res.status(400).json({ error: 'معرّف الطرف الآخر مطلوب' });
  }

  const limitCount = parseInt(req.query.limit as string, 10) || 80;
  const { getPrivateMessagesList } = await import('./db');
  const messages = await getPrivateMessagesList(req.user!.id, otherUserId, limitCount);
  res.json({ success: true, messages });
});

apiRouter.post('/private-messages', requireAuth, async (req, res) => {
  const receiverId = parseInt(req.body.receiverId, 10);
  if (!receiverId) {
    return res.status(400).json({ error: 'معرّف المستلم مطلوب' });
  }

  const { text, imageUrl, storagePath, audioUrl, fileUrl, fileName } = req.body;
  if (!text && !imageUrl && !audioUrl && !fileUrl) {
    return res.status(400).json({ error: 'محتوى الرسالة مطلوب' });
  }

  const now = Date.now();
  const newMsg = {
    id: `pm_${now}_${req.user!.id}_${Math.random().toString(36).substring(2, 7)}`,
    senderId: req.user!.id,
    receiverId,
    senderName: req.user!.displayName,
    senderRole: req.user!.role,
    text: text ? String(text).trim() : undefined,
    imageUrl: imageUrl || undefined,
    storagePath: storagePath || undefined,
    audioUrl: audioUrl || undefined,
    fileUrl: fileUrl || undefined,
    fileName: fileName || undefined,
    timestamp: now,
  };

  const { savePrivateMessageRecord } = await import('./db');
  await savePrivateMessageRecord(newMsg);

  // Dispatch Push Notification to receiver
  try {
    const tokens = await getTokensForUser(receiverId);
    if (tokens.length > 0) {
      const bodySnippet = newMsg.text || (newMsg.audioUrl ? '🎤 رسالة صوتية خاصة' : '📷 مرفق جديد');
      const notifJob = {
        id: `job_${now}_${Math.random().toString(36).substring(2, 7)}`,
        targetUserIds: [receiverId],
        title: req.user!.displayName,
        body: bodySnippet,
        data: {
          partnerId: String(req.user!.id),
          chatType: 'private',
          messageId: newMsg.id,
          senderName: req.user!.displayName,
        },
        createdAt: now,
      };
      void recordNotificationJob(notifJob);
    }
  } catch (e) {
    console.warn('[Notif] Error dispatching private notification job:', e);
  }

  res.json({ success: true, message: newMsg });
});

// ==========================================
// 8. CHALLENGE FULL SYNC (ANDROID API CLIENT)
// ==========================================

apiRouter.post('/challenge', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const challengeObj = req.body.challenge;
    const tradesArr = Array.isArray(req.body.trades) ? req.body.trades : [];

    if (!challengeObj) {
      return res.status(400).json({ error: 'بيانات الرحلة مطلوبة' });
    }

    const challenge = {
      id: challengeObj.id || `challenge_${user.id}`,
      userId: user.id,
      userName: challengeObj.userName || user.displayName,
      initialCapitalCents: parseInt(challengeObj.initialCapitalCents, 10) || 10000,
      currentBalanceCents: parseInt(challengeObj.currentBalanceCents, 10) || 10000,
      targetBalanceCents: parseInt(challengeObj.targetBalanceCents, 10) || 300000,
      tradeCount: tradesArr.length,
      challengeStarted: tradesArr.length > 0,
      createdAt: challengeObj.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const { saveFullChallengeAndTrades } = await import('./db');
    await saveFullChallengeAndTrades(user.id, challenge, tradesArr);

    res.json({ success: true, challenge, tradesCount: tradesArr.length });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حفظ بيانات الرحلة: ' + (err?.message || err) });
  }
});

// ==========================================
// 9. PACKAGES
// ==========================================

apiRouter.get('/packages', (req, res) => {
  res.json([
    {
      id: 'pkg_silver',
      name: 'الباقة الفضية',
      description: 'دخول القنوات العامة ومتابعة رحلة التداول لـ 150 محطة بدقة.',
      priceDollars: 30,
      period: 'شهري',
      features: ['تتبع 150 محطة تداول', 'القناة العامة للنقاشات', 'تقارير الأداء PDF'],
    },
    {
      id: 'pkg_gold',
      name: 'الباقة الذهبية',
      description: 'دخول قناة Sami VIP الخاصة بالتوصيات والصفقات المتقدمة.',
      priceDollars: 60,
      period: 'شهري',
      features: ['جميع ميزات الباقة الفضية', 'قناة Sami VIP الخاصة', 'إشارات وتوصيات يومية مباشر'],
    },
    {
      id: 'pkg_vip_lifetime',
      name: 'باقة VIP الدائمة',
      description: 'عضوية دائمة مع كافة قنوات وتوصيات القائد Sami.',
      priceDollars: 150,
      period: 'دائم',
      features: ['عضوية VIP دائمة مدى الحياة', 'دعم خاص مباشر من Sami', 'أولوية في جميع الدورات والصفقات'],
    },
  ]);
});

// ==========================================
// 10. APP UPDATES SYSTEM
// ==========================================

apiRouter.get('/updates/latest', async (req, res) => {
  const update = await getLatestAppUpdate();
  res.json({ success: true, update });
});

apiRouter.post('/updates', requireAuth, requireRole(['owner']), async (req, res) => {
  try {
    const { versionName, versionCode, downloadUrl, description, isMandatory, minSupportedVersionCode } = req.body;

    if (!versionName || !versionCode || !downloadUrl) {
      return res.status(400).json({ error: 'رقم الإصدار ورابط التنزيل مطلوبان' });
    }

    const updateRecord = {
      id: 'latest',
      versionName: String(versionName).trim(),
      versionCode: Math.floor(Number(versionCode)) || 11,
      downloadUrl: String(downloadUrl).trim(),
      description: String(description || '').trim(),
      isMandatory: Boolean(isMandatory),
      minSupportedVersionCode: minSupportedVersionCode ? Math.floor(Number(minSupportedVersionCode)) : undefined,
      publishedBy: req.user!.id,
      publishedByName: req.user!.displayName,
      updatedAt: Date.now(),
    };

    await saveAppUpdateRecord(updateRecord);

    // Notify all active users of the new update
    try {
      const allUsers = await getAllUsersList();
      const targetUserIds = allUsers.map((u) => u.id);
      const notifJob = {
        id: `job_update_${Date.now()}`,
        targetUserIds,
        title: '🚀 تحديث جديد متوفر لتطبيق Sami',
        body: `الإصدار ${updateRecord.versionName}: ${updateRecord.description || 'تحسينات وإصلاحات جديدة'}`,
        data: {
          type: 'app_update',
          versionName: updateRecord.versionName,
          versionCode: String(updateRecord.versionCode),
          downloadUrl: updateRecord.downloadUrl,
          isMandatory: String(updateRecord.isMandatory),
        },
        createdAt: Date.now(),
      };
      void recordNotificationJob(notifJob);
    } catch {}

    res.json({ success: true, update: updateRecord });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل نشر التحديث: ' + (err?.message || err) });
  }
});

// ==========================================
// 11. NOTIFICATIONS & FCM TOKENS
// ==========================================

apiRouter.post('/notifications/token', requireAuth, async (req, res) => {
  try {
    const { token, deviceId, platform, deviceModel } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'رمز الجهاز (Token) مطلوب' });
    }

    const devId = String(deviceId || `dev_${req.user!.id}_${Date.now()}`);
    const tokenRecord = {
      id: `token_${req.user!.id}_${devId}`,
      token: String(token),
      userId: req.user!.id,
      username: req.user!.username,
      deviceId: devId,
      platform: String(platform || 'android'),
      deviceModel: deviceModel ? String(deviceModel) : undefined,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };

    await saveFcmToken(tokenRecord);
    res.json({ success: true, registered: true });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حفظ رمز الإشعار: ' + (err?.message || err) });
  }
});


