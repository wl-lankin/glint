; Glint's installer hooks (Tauri NSIS bundle, per-user install: SHCTX is HKCU).
; Tauri registers the extensions from bundle.fileAssociations under the ProgID Glint.Image. These
; hooks add what Tauri does not:
; - an image document icon for Glint.Image,
; - Glint's page under Settings > Apps > Default apps, so it can be made the default per type,
; - Glint in the "Open with" list of every supported type,
; and remove all of it again on uninstall.

!macro GLINT_TYPE EXT
  WriteRegStr SHCTX "Software\Glint\Capabilities\FileAssociations" ".${EXT}" "Glint.Image"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "Glint.Image" ""
!macroend

!macro GLINT_TYPE_REMOVE EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "Glint.Image"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
!macroend

!macro GLINT_ALL_TYPES MACRO
  !insertmacro ${MACRO} "png"
  !insertmacro ${MACRO} "apng"
  !insertmacro ${MACRO} "jpg"
  !insertmacro ${MACRO} "jpeg"
  !insertmacro ${MACRO} "jpe"
  !insertmacro ${MACRO} "jfif"
  !insertmacro ${MACRO} "pjpeg"
  !insertmacro ${MACRO} "pjp"
  !insertmacro ${MACRO} "gif"
  !insertmacro ${MACRO} "webp"
  !insertmacro ${MACRO} "avif"
  !insertmacro ${MACRO} "heic"
  !insertmacro ${MACRO} "heif"
  !insertmacro ${MACRO} "svg"
  !insertmacro ${MACRO} "bmp"
  !insertmacro ${MACRO} "dib"
  !insertmacro ${MACRO} "ico"
  !insertmacro ${MACRO} "cur"
  !insertmacro ${MACRO} "tif"
  !insertmacro ${MACRO} "tiff"
  !insertmacro ${MACRO} "tga"
  !insertmacro ${MACRO} "qoi"
  !insertmacro ${MACRO} "dds"
  !insertmacro ${MACRO} "hdr"
  !insertmacro ${MACRO} "exr"
  !insertmacro ${MACRO} "pbm"
  !insertmacro ${MACRO} "pgm"
  !insertmacro ${MACRO} "ppm"
  !insertmacro ${MACRO} "pnm"
  !insertmacro ${MACRO} "pam"
  !insertmacro ${MACRO} "ff"
  !insertmacro ${MACRO} "jxl"
  !insertmacro ${MACRO} "psd"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\Glint.Image" "" "Image"
  WriteRegStr SHCTX "Software\Classes\Glint.Image\DefaultIcon" "" "$INSTDIR\icons\file-image.ico,0"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "Glint"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Glint\Capabilities" "ApplicationName" "Glint"
  WriteRegStr SHCTX "Software\Glint\Capabilities" "ApplicationIcon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Glint\Capabilities" "ApplicationDescription" "Every image. Instantly."
  WriteRegStr SHCTX "Software\RegisteredApplications" "Glint" "Software\Glint\Capabilities"
  !insertmacro GLINT_ALL_TYPES GLINT_TYPE
  ; Explorer reads file type icons and associations at login; tell it they changed.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro GLINT_ALL_TYPES GLINT_TYPE_REMOVE
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Glint"
  DeleteRegKey SHCTX "Software\Glint"
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  DeleteRegKey SHCTX "Software\Classes\Glint.Image\DefaultIcon"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
