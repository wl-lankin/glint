mod batch;
mod commands;
mod formats;
mod protocol;

use std::path::PathBuf;

use tauri::Manager;

pub fn run() {
    let app = tauri::Builder::default()
        // Registered first: a second Glint process hands its files over before anything else starts.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let files = batch::files_from_args(argv.into_iter().skip(1), &PathBuf::from(cwd));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            app.state::<batch::Batch>().add(app, files);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(batch::Batch::default())
        .manage(protocol::ThumbCache::default())
        .register_asynchronous_uri_scheme_protocol("glint", protocol::handle)
        .invoke_handler(tauri::generate_handler![
            commands::ready,
            commands::extensions,
            commands::siblings,
            commands::file_info,
            commands::copy_image,
            commands::save_svg,
        ])
        .setup(|app| {
            let cwd = std::env::current_dir().unwrap_or_default();
            let files = batch::files_from_args(std::env::args().skip(1), &cwd);
            app.state::<batch::Batch>().add(app.handle(), files);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Glint could not start");

    app.run(|_app, _event| {
        // Finder sends files as an event, also the ones Glint was launched with.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let files = urls.iter().filter_map(|u| u.to_file_path().ok()).filter(|p| batch::is_image(p)).collect();
            _app.state::<batch::Batch>().add(_app, files);
        }
    });
}
