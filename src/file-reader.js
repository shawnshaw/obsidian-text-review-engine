/**
 * file-reader.js
 * 读取文件系统文件（.docx / .txt / .md 等），仅提取纯文本供审校引擎使用。
 * Word 图片仅在展示层还原排版，审校范围限定为文字内容。
 */

const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

/**
 * 读取任意支持格式的文件，返回 { text, images, meta }
 * - text: 纯文本（审校引擎使用）
 * - images: [{ dataUrl, alt }]
 * - meta: { fileName, ext, size }
 */
async function readFileByPath(filePath) {
  const ext = (path.extname(filePath) || '').toLowerCase().replace(/^\./, '');
  const stats = fs.statSync(filePath);

  if (ext === 'docx') {
    return readDocx(filePath, stats);
  }
  if (ext === 'txt' || ext === 'md') {
    return readPlainText(filePath, stats);
  }
  if (ext === 'rtf') {
    return readRtf(filePath, stats);
  }
  return { text: '', images: [], meta: { fileName: path.basename(filePath), ext, size: stats.size, error: `不支持的格式: .${ext}` } };
}

/** 读取 .docx — 仅文字审校，图片用 dataUrl 保存用于展示 */
async function readDocx(filePath, stats) {
  const arrayBuffer = fs.readFileSync(filePath);
  const docxInput = { buffer: arrayBuffer };
  const result = await mammoth.convertToHtml(docxInput, {
    convertImage: mammoth.images.imgElement((img) => {
      return img.readAsDataUrl().then((dataUrl) => ({
        src: dataUrl,
        alt: img.content || '',
      }));
    }),
  });

  const textResult = await mammoth.extractRawText(docxInput);

  return {
    text: textResult.value,
    html: result.value,
    messages: result.messages,
    images: [],
    meta: {
      fileName: path.basename(filePath),
      ext: 'docx',
      size: stats.size,
    },
  };
}

/** 读取 .txt / .md */
async function readPlainText(filePath, stats) {
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    text: content,
    html: null,
    images: [],
    meta: {
      fileName: path.basename(filePath),
      ext: path.extname(filePath).replace(/^\./, ''),
      size: stats.size,
    },
  };
}

/** 简单 RTF 剥离（无图片支持） */
async function readRtf(filePath, stats) {
  const content = fs.readFileSync(filePath, 'utf8');
  const text = content
    .replace(/\\[a-z]+\d*\s?/gi, '')
    .replace(/\{|\}/g, '')
    .replace(/\\par/g, '\n')
    .trim();
  return {
    text,
    html: null,
    images: [],
    meta: { fileName: path.basename(filePath), ext: 'rtf', size: stats.size },
  };
}

/** 在 Obsidian 内打开系统文件选择对话框（macOS） */
function openFileDialogMac(title = '选择文件', extensions = ['docx', 'txt', 'md', 'rtf']) {
  return new Promise((resolve, reject) => {
    try {
      const { dialog } = require('electron');
      dialog.showOpenDialog({
        title,
        filters: [
          { name: '支持格式', extensions },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      }).then((result) => {
        if (result.canceled || !result.filePaths.length) {
          reject(new Error('用户取消选择'));
        } else {
          resolve(result.filePaths[0]);
        }
      }).catch(reject);
    } catch (err) {
      reject(new Error('Electron dialog not available — 需在 Obsidian 桌面端运行，或使用浏览器文件选择器'));
    }
  });
}

/** 获取已注册的文件选择器（兼容 Obsidian 0.x / 1.x API） */
function hasFilePicker() {
  try {
    const { FileSystemAdapter } = require('obsidian');
    return !!FileSystemAdapter;
  } catch {
    return false;
  }
}

module.exports = {
  readFileByPath,
  readDocx,
  readPlainText,
  readRtf,
  openFileDialogMac,
  hasFilePicker,
};