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
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running LapLens");
}
