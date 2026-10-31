import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';

const WebViewComponent: any = WebView;

interface ChatUploadModalProps {
  visible: boolean;
  onClose: () => void;
  serverUrl: string;
  initialTab?: 'file' | 'voice' | 'url';
  onSendAttachment: (props: {
    fileUrl: string;
    fileName: string;
    fileType?: string;
    fileSize?: number;
    isVoiceNote?: boolean;
    caption?: string;
  }) => void;
}

export const ChatUploadModal: React.FC<ChatUploadModalProps> = ({
  visible,
  onClose,
  serverUrl,
  initialTab = 'file',
  onSendAttachment,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'voice' | 'url'>(initialTab);
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const webViewRef = useRef<WebView>(null);

  React.useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
      setIsUploading(false);
      setCaption('');
      setDirectUrl('');
    }
  }, [visible, initialTab]);

  if (!visible) return null;

  const cleanServerUrl = (serverUrl || 'https://backend-9i6w.onrender.com')
    .replace(/\/api\/?$/, '')
    .replace(/\/+$/, '');
  const uploadEndpoint = `${cleanServerUrl}/upload`;

  // HTML running inside WebView for native file picking and microphone MediaRecorder
  const uploadHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: transparent; color: #fff; padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .btn { background: #38BDF8; color: #0F172A; font-weight: 800; font-size: 15px; border: none; border-radius: 12px; padding: 14px 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 100%; margin-top: 10px; }
    .btn-record { background: #EF4444; color: #fff; }
    .btn-recording { background: #DC2626; animation: pulse 1s infinite alternate; }
    @keyframes pulse { from { opacity: 1; transform: scale(1); } to { opacity: 0.8; transform: scale(0.98); } }
    .info { font-size: 13px; color: #94A3B8; text-align: center; margin-top: 10px; }
    .preview { margin-top: 12px; width: 100%; text-align: center; font-size: 14px; color: #38BDF8; font-weight: 700; word-break: break-all; }
    audio { width: 100%; margin-top: 10px; }
    #fileInput { display: none; }
  </style>
</head>
<body>
  <div id="fileSection" style="width:100%; display: ${activeTab === 'file' ? 'block' : 'none'};">
    <input type="file" id="fileInput" />
    <button class="btn" onclick="document.getElementById('fileInput').click()">📁 Choose Photo / File</button>
    <div id="fileInfo" class="preview"></div>
    <button id="uploadFileBtn" class="btn" style="display:none; background:#10B981; color:#fff;" onclick="uploadSelectedFile()">🚀 Upload & Send</button>
  </div>

  <div id="voiceSection" style="width:100%; display: ${activeTab === 'voice' ? 'block' : 'none'};">
    <button id="recordBtn" class="btn btn-record" onclick="toggleRecord()">🎙️ Start Recording</button>
    <div id="recStatus" class="info">Tap to record your voice note</div>
    <audio id="audioPreview" controls style="display:none;"></audio>
    <button id="sendVoiceBtn" class="btn" style="display:none; background:#10B981; color:#fff;" onclick="uploadVoiceNote()">🚀 Send Voice Note</button>
  </div>

  <script>
    const uploadUrl = "${uploadEndpoint}";
    let selectedFile = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordedBlob = null;
    let isRecording = false;

    // File selection
    const MAX_SIZE_BYTES = 100 * 1024 * 1024;
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', function(e) {
      if (e.target.files && e.target.files.length > 0) {
        var file = e.target.files[0];
        if (file.size > MAX_SIZE_BYTES) {
          postToRN({ type: 'upload_error', error: 'File exceeds 100MB limit (' + Math.round(file.size / (1024 * 1024)) + 'MB).' });
          e.target.value = '';
          return;
        }
        selectedFile = file;
        document.getElementById('fileInfo').innerText = selectedFile.name + ' (' + Math.round(selectedFile.size / 1024) + ' KB)';
        document.getElementById('uploadFileBtn').style.display = 'block';
      }
    });

    function uploadSelectedFile() {
      if (!selectedFile) return;
      postToRN({ type: 'upload_start' });
      const fd = new FormData();
      fd.append('file', selectedFile);

      fetch(uploadUrl, { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
          if (data && data.fileUrl) {
            postToRN({
              type: 'upload_success',
              fileUrl: data.fileUrl,
              fileName: data.fileName || selectedFile.name,
              fileType: data.fileType || selectedFile.type,
              fileSize: data.fileSize || selectedFile.size,
              isVoiceNote: false
            });
          } else {
            postToRN({ type: 'upload_error', error: data.message || 'Server upload failed' });
          }
        })
        .catch(err => {
          postToRN({ type: 'upload_error', error: err.message || 'Network error' });
        });
    }

    // Voice recording
    let selectedMime = 'audio/webm';
    let recordStartTime = 0;
    let recordedDurationSec = 0;

    async function toggleRecord() {
      if (!isRecording) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioChunks = [];
          
          const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
          for (var i = 0; i < mimeCandidates.length; i++) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mimeCandidates[i])) {
              selectedMime = mimeCandidates[i];
              break;
            }
          }

          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMime });
          } catch(e) {
            mediaRecorder = new MediaRecorder(stream);
            selectedMime = 'audio/webm';
          }

          mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
          mediaRecorder.onstop = () => {
            recordedDurationSec = Math.max(1, Math.round((Date.now() - recordStartTime) / 1000));
            recordedBlob = new Blob(audioChunks, { type: selectedMime });
            const preview = document.getElementById('audioPreview');
            preview.src = URL.createObjectURL(recordedBlob);
            preview.style.display = 'block';
            document.getElementById('sendVoiceBtn').style.display = 'block';
            stream.getTracks().forEach(t => t.stop());
          };
          recordStartTime = Date.now();
          mediaRecorder.start();
          isRecording = true;
          document.getElementById('recordBtn').innerText = '⏹️ Stop Recording';
          document.getElementById('recordBtn').className = 'btn btn-record btn-recording';
          document.getElementById('recStatus').innerText = '🔴 Recording... Tap Stop when done';
          document.getElementById('sendVoiceBtn').style.display = 'none';
        } catch (err) {
          postToRN({ type: 'record_error', error: 'Microphone access denied: ' + err.message });
        }
      } else {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        isRecording = false;
        document.getElementById('recordBtn').innerText = '🎙️ Record Again';
        document.getElementById('recordBtn').className = 'btn btn-record';
        document.getElementById('recStatus').innerText = 'Preview your recording below:';
      }
    }

    function uploadVoiceNote() {
      if (!recordedBlob) return;
      postToRN({ type: 'upload_start' });
      const fd = new FormData();
      const ext = selectedMime.indexOf('mp4') !== -1 ? 'mp4' : (selectedMime.indexOf('aac') !== -1 ? 'aac' : (selectedMime.indexOf('ogg') !== -1 ? 'ogg' : 'webm'));
      const fn = 'voice_note_' + Date.now() + '_' + recordedDurationSec + 's.' + ext;
      fd.append('file', recordedBlob, fn);

      fetch(uploadUrl, { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
          if (data && data.fileUrl) {
            postToRN({
              type: 'upload_success',
              fileUrl: data.fileUrl,
              fileName: fn,
              fileType: selectedMime,
              fileSize: recordedBlob.size,
              isVoiceNote: true
            });
          } else {
            postToRN({ type: 'upload_error', error: data.message || 'Server upload failed' });
          }
        })
        .catch(err => {
          postToRN({ type: 'upload_error', error: err.message || 'Network error' });
        });
    }

    function postToRN(obj) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    }
  </script>
</body>
</html>
`;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'upload_start') {
        setIsUploading(true);
      } else if (data.type === 'upload_success') {
        setIsUploading(false);
        onSendAttachment({
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          isVoiceNote: data.isVoiceNote,
          caption: caption.trim() || undefined,
        });
        onClose();
      } else if (data.type === 'upload_error') {
        setIsUploading(false);
        Alert.alert('Upload Failed', data.error || 'Could not upload file to chat server.');
      } else if (data.type === 'record_error') {
        setIsUploading(false);
        Alert.alert('Microphone Error', data.error);
      }
    } catch {}
  };

  const handleSendDirectUrl = () => {
    if (!directUrl.trim()) return;
    const url = directUrl.trim();
    const isImage = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);
    const fileName = url.substring(url.lastIndexOf('/') + 1) || 'Attachment';
    onSendAttachment({
      fileUrl: url,
      fileName,
      fileType: isImage ? 'image/jpeg' : 'application/octet-stream',
      isVoiceNote: false,
      caption: caption.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Send Attachment</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Navigation Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'file' && styles.tabBtnActive]}
              onPress={() => setActiveTab('file')}
            >
              <Text style={[styles.tabText, activeTab === 'file' && styles.tabTextActive]}>📁 Photo / File</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'voice' && styles.tabBtnActive]}
              onPress={() => setActiveTab('voice')}
            >
              <Text style={[styles.tabText, activeTab === 'voice' && styles.tabTextActive]}>🎙️ Voice Note</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'url' && styles.tabBtnActive]}
              onPress={() => setActiveTab('url')}
            >
              <Text style={[styles.tabText, activeTab === 'url' && styles.tabTextActive]}>🔗 Web URL</Text>
            </TouchableOpacity>
          </View>

          {/* Optional Caption Input */}
          <View style={styles.captionBox}>
            <TextInput
              style={styles.captionInput}
              placeholder="Add an optional caption..."
              placeholderTextColor="#64748B"
              value={caption}
              onChangeText={setCaption}
            />
          </View>

          {/* Body Content */}
          {activeTab === 'url' ? (
            <View style={styles.urlSection}>
              <Text style={styles.inputLabel}>Media or File Direct URL</Text>
              <TextInput
                style={styles.urlInput}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor="#64748B"
                value={directUrl}
                onChangeText={setDirectUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.sendUrlBtn, { opacity: directUrl.trim() ? 1 : 0.5 }]}
                disabled={!directUrl.trim()}
                onPress={handleSendDirectUrl}
              >
                <Text style={styles.sendUrlBtnText}>Send Attachment 🚀</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.webviewWrapper}>
              <WebViewComponent
                ref={webViewRef}
                key={activeTab}
                source={{ html: uploadHtml }}
                onMessage={handleMessage}
                style={styles.webview}
                javaScriptEnabled
                domStorageEnabled
                allowFileAccess
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                originWhitelist={['*']}
              />
            </View>
          )}

          {/* Uploading Overlay */}
          {isUploading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>Uploading to chat server...</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 380,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeBtn: {
    fontSize: 20,
    color: '#94A3B8',
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#38BDF8',
  },
  captionBox: {
    marginBottom: 12,
  },
  captionInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  webviewWrapper: {
    height: 190,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
  },
  webview: {
    backgroundColor: '#1E293B',
  },
  urlSection: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
  },
  urlInput: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  sendUrlBtn: {
    backgroundColor: '#38BDF8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendUrlBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  loadingText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
});
