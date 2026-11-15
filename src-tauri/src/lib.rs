#[tauri::command]
fn read_text_file(path: String) -> Result<Option<String>, String> {
    let file = std::path::Path::new(&path);
    if !file.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(file).map_err(|err| err.to_string())?;
    match String::from_utf8(bytes) {
        Ok(text) => Ok(Some(text)),
        Err(err) => Ok(Some(String::from_utf8_lossy(err.as_bytes()).into_owned())),
    }
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

#[tauri::command]
fn read_moov_base64(path: String) -> Result<Option<String>, String> {
    use std::fs::File;

    let mut file = File::open(&path).map_err(|err| err.to_string())?;
    let end = file.metadata().map_err(|err| err.to_string())?.len();
    match find_moov(&mut file, 0, end)? {
        Some(bytes) => Ok(Some(base64_encode(&bytes))),
        None => Ok(None),
    }
}

fn find_moov(file: &mut std::fs::File, start: u64, end: u64) -> Result<Option<Vec<u8>>, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut pos = start;
    while pos + 8 <= end {
        file.seek(SeekFrom::Start(pos)).map_err(|err| err.to_string())?;
        let size = read_u32(file)? as u64;
        let mut kind = [0u8; 4];
        file.read_exact(&mut kind).map_err(|err| err.to_string())?;
        let (header, total) = if size == 1 {
            (16u64, read_u64(file)?)
        } else if size == 0 {
            (8u64, end - pos)
        } else {
            (8u64, size)
        };
        if total < header || pos.saturating_add(total) > end {
            return Ok(None);
        }
        if &kind == b"moov" {
            let len = (total - header) as usize;
            if len > 16 * 1024 * 1024 {
                return Ok(None);
            }
            let mut buf = vec![0u8; len];
            file.seek(SeekFrom::Start(pos + header))
                .map_err(|err| err.to_string())?;
            file.read_exact(&mut buf).map_err(|err| err.to_string())?;
            return Ok(Some(buf));
        }
        pos += total;
    }
    Ok(None)
}

fn read_u32(file: &mut std::fs::File) -> Result<u32, String> {
    use std::io::Read;
    let mut bytes = [0u8; 4];
    file.read_exact(&mut bytes).map_err(|err| err.to_string())?;
    Ok(u32::from_be_bytes(bytes))
}

fn read_u64(file: &mut std::fs::File) -> Result<u64, String> {
    use std::io::Read;
    let mut bytes = [0u8; 8];
    file.read_exact(&mut bytes).map_err(|err| err.to_string())?;
    Ok(u64::from_be_bytes(bytes))
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut index = 0;
    while index + 3 <= data.len() {
        let value = ((data[index] as u32) << 16)
            | ((data[index + 1] as u32) << 8)
            | (data[index + 2] as u32);
        out.push(TABLE[((value >> 18) & 63) as usize] as char);
        out.push(TABLE[((value >> 12) & 63) as usize] as char);
        out.push(TABLE[((value >> 6) & 63) as usize] as char);
        out.push(TABLE[(value & 63) as usize] as char);
        index += 3;
    }
    if index < data.len() {
        let remain = data.len() - index;
        let mut value = (data[index] as u32) << 16;
        if remain == 2 {
            value |= (data[index + 1] as u32) << 8;
        }
        out.push(TABLE[((value >> 18) & 63) as usize] as char);
        out.push(TABLE[((value >> 12) & 63) as usize] as char);
        if remain == 2 {
            out.push(TABLE[((value >> 6) & 63) as usize] as char);
            out.push('=');
        } else {
            out.push('=');
            out.push('=');
        }
    }
    out
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    std::fs::write(path, contents).map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            file_exists,
            read_moov_base64
        ])
        .run(tauri::generate_context!())
        .expect("error while running LapLens");
}

#[cfg(test)]
mod tests {
    use super::find_moov;
    use std::io::Write;

    #[test]
    fn reads_moov_after_media_data() {
        let path = std::env::temp_dir().join("laplens-moov-test.mp4");
        let payload = b"moov-body";
        let mut bytes = Vec::new();
        push_box(&mut bytes, b"ftyp", &[0u8; 8]);
        push_box(&mut bytes, b"mdat", &[0u8; 24]);
        push_box(&mut bytes, b"moov", payload);
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(&bytes).unwrap();
        drop(file);
        let mut opened = std::fs::File::open(&path).unwrap();
        let found = find_moov(&mut opened, 0, bytes.len() as u64).unwrap().unwrap();
        let _ = std::fs::remove_file(&path);
        assert_eq!(found, payload);
    }

    fn push_box(out: &mut Vec<u8>, kind: &[u8; 4], content: &[u8]) {
        let size = (8 + content.len()) as u32;
        out.extend_from_slice(&size.to_be_bytes());
        out.extend_from_slice(kind);
        out.extend_from_slice(content);
    }
}
