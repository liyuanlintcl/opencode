use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

fn omni_studio_dir() -> PathBuf {
    dirs::home_dir()
        .expect("failed to get home dir")
        .join(".omni_studio")
}

fn to_plural(ty: &str) -> String {
    match ty {
        "skill" => "skills".to_string(),
        "tool" => "tools".to_string(),
        "plugin" => "plugins".to_string(),
        "agent" => "agents".to_string(),
        _ => ty.to_string(),
    }
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct ExtensionState {
    enabled: bool,
    version: String,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct OmniStudioState {
    #[serde(default)]
    skills: std::collections::HashMap<String, ExtensionState>,
    #[serde(default)]
    tools: std::collections::HashMap<String, ExtensionState>,
    #[serde(default)]
    plugins: std::collections::HashMap<String, ExtensionState>,
    #[serde(default)]
    agents: std::collections::HashMap<String, ExtensionState>,
}

fn read_state() -> Result<OmniStudioState, String> {
    let path = omni_studio_dir().join("state.json");
    if !path.exists() {
        return Ok(OmniStudioState::default());
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn write_state(state: &OmniStudioState) -> Result<(), String> {
    let dir = omni_studio_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("state.json");
    let data = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn unzip_file(zip_path: &std::path::Path, dest_dir: &std::path::Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = dest_dir.join(file.enclosed_name().ok_or("invalid zip path")?);

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UserToken {
    access_token: String,
    refresh_token: String,
}

#[tauri::command]
#[specta::specta]
pub async fn download_extension(
    ty: String,
    slug: String,
    version: String,
    api_base: String,
    token: String,
) -> Result<(), String> {
    let plural = to_plural(&ty);
    let download_url = format!("{}/packages/{}/{}/revisions/{}/download", api_base, plural, slug, version);
    let ext_dir = omni_studio_dir().join(&plural).join(&slug);
    let zip_path = omni_studio_dir().join(&plural).join(format!("{}.zip", slug));

    fs::create_dir_all(ext_dir.parent().unwrap()).map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let response = client
        .get(&download_url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("download failed: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let mut file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    unzip_file(&zip_path, &ext_dir)?;
    let _ = fs::remove_file(&zip_path);

    let mut state = read_state()?;
    let map = match plural.as_str() {
        "skills" => &mut state.skills,
        "tools" => &mut state.tools,
        "plugins" => &mut state.plugins,
        "agents" => &mut state.agents,
        _ => return Err("invalid type".to_string()),
    };
    map.insert(
        slug,
        ExtensionState {
            enabled: true,
            version,
        },
    );
    write_state(&state)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn remove_extension_dir(ty: String, slug: String) -> Result<(), String> {
    let plural = to_plural(&ty);
    let ext_dir = omni_studio_dir().join(&plural).join(&slug);
    if ext_dir.exists() {
        fs::remove_dir_all(&ext_dir).map_err(|e| e.to_string())?;
    }

    let mut state = read_state()?;
    let map = match plural.as_str() {
        "skills" => &mut state.skills,
        "tools" => &mut state.tools,
        "plugins" => &mut state.plugins,
        "agents" => &mut state.agents,
        _ => return Err("invalid type".to_string()),
    };
    map.remove(&slug);
    write_state(&state)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn update_extension_state(ty: String, slug: String, enabled: bool) -> Result<(), String> {
    let plural = to_plural(&ty);
    let mut state = read_state()?;
    let map = match plural.as_str() {
        "skills" => &mut state.skills,
        "tools" => &mut state.tools,
        "plugins" => &mut state.plugins,
        "agents" => &mut state.agents,
        _ => return Err("invalid type".to_string()),
    };
    if let Some(entry) = map.get_mut(&slug) {
        entry.enabled = enabled;
        write_state(&state)?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub struct OmniStudioConfig {
    api_base: String,
    auth_base: String,
    token: UserToken,
}

#[tauri::command]
#[specta::specta]
pub fn sync_omni_studio_config(
    api_base: String,
    auth_base: String,
    token: UserToken,
) -> Result<(), String> {
    let dir = omni_studio_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("omni-studio.json");
    let config = OmniStudioConfig {
        api_base,
        auth_base,
        token,
    };
    let data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn remove_omni_studio_config() -> Result<(), String> {
    let path = omni_studio_dir().join("omni-studio.json");
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
