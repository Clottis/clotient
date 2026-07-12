use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use tauri::Manager;

#[derive(Debug, Deserialize)]
pub struct RustHttpRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body_type: String,
    pub body_text: Option<String>,
    pub form_data: Option<Vec<(String, String)>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct RustHttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub time_ms: u64,
    pub size_bytes: usize,
    pub content_type: String,
}

fn format_reqwest_err(e: reqwest::Error) -> String {
    let mut msg = e.to_string();
    let mut current = std::error::Error::source(&e);
    while let Some(cause) = current {
        msg.push_str(&format!("\nCaused by: {}", cause));
        current = cause.source();
    }
    msg
}

#[tauri::command]
async fn send_http_request(req: RustHttpRequest) -> Result<RustHttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(
            req.timeout_ms.unwrap_or(30000),
        ))
        .use_rustls_tls()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(format_reqwest_err)?;

    let method = reqwest::Method::from_bytes(req.method.as_bytes())
        .map_err(|_| "Invalid HTTP Method".to_string())?;

    let mut request_builder = client.request(method, &req.url);

    // Apply headers safely
    for (k, v) in req.headers {
        if let (Ok(name), Ok(value)) = (
            reqwest::header::HeaderName::from_bytes(k.as_bytes()),
            reqwest::header::HeaderValue::from_str(&v),
        ) {
            request_builder = request_builder.header(name, value);
        }
    }

    // Apply body based on body_type
    request_builder = match req.body_type.as_str() {
        "json" | "raw" => {
            if let Some(text) = req.body_text {
                request_builder.body(text)
            } else {
                request_builder
            }
        }
        "urlencoded" => {
            if let Some(form) = req.form_data {
                let params: HashMap<String, String> = form.into_iter().collect();
                request_builder.form(&params)
            } else {
                request_builder
            }
        }
        "form-data" => {
            if let Some(form_fields) = req.form_data {
                let mut multipart = reqwest::multipart::Form::new();
                for (k, v) in form_fields {
                    multipart = multipart.text(k, v);
                }
                request_builder.multipart(multipart)
            } else {
                request_builder
            }
        }
        _ => request_builder, // none
    };

    let start_time = std::time::Instant::now();
    let response = request_builder.send().await.map_err(format_reqwest_err)?;
    let duration = start_time.elapsed().as_millis() as u64;

    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();

    let mut response_headers = HashMap::new();
    for (name, val) in response.headers().iter() {
        if let Ok(val_str) = val.to_str() {
            response_headers.insert(name.to_string(), val_str.to_string());
        }
    }

    let content_type = response_headers
        .get("content-type")
        .cloned()
        .unwrap_or_else(|| "text/plain".to_string());

    let body_bytes = response.bytes().await.map_err(format_reqwest_err)?;
    let size_bytes = body_bytes.len();
    let body_string = String::from_utf8_lossy(&body_bytes).to_string();

    Ok(RustHttpResponse {
        status: status.as_u16(),
        status_text,
        headers: response_headers,
        body: body_string,
        time_ms: duration,
        size_bytes,
        content_type,
    })
}

#[tauri::command]
fn load_data(app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let file_path = config_dir.join(file_name);
    if !file_path.exists() {
        return Ok("".to_string());
    }
    fs::read_to_string(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_data(app: tauri::AppHandle, file_name: String, content: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let file_path = config_dir.join(file_name);
    let mut file = fs::File::create(file_path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_local_storage(app: tauri::AppHandle) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    if config_dir.exists() {
        fs::remove_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            send_http_request,
            load_data,
            save_data,
            clear_local_storage
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
