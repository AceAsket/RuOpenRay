package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
)

// Stream into the asset filesystem, not ParseMultipartForm's RAM/tmp spool.
// Limit the complete body before processing even the first part.
func (s *serverState) readGeoUpload(r *http.Request) (path, name string, size int64, err error) {
	if r.ContentLength > maxGeoUploadBytes+(256<<10) {
		return "", "", 0, fmt.Errorf("Загрузка превышает допустимый размер")
	}
	r.Body = http.MaxBytesReader(nil, r.Body, maxGeoUploadBytes+(256<<10))
	defer r.Body.Close()
	reader, err := r.MultipartReader()
	if err != nil {
		return "", "", 0, err
	}
	if err = os.MkdirAll(s.cfg.GeoDir, 0755); err != nil {
		return "", "", 0, err
	}
	fields := url.Values{}
	defer func() {
		if err != nil && path != "" {
			os.Remove(path)
		}
	}()
	for count := 0; ; count++ {
		part, readErr := reader.NextPart()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			err = readErr
			return
		}
		if count >= 16 {
			part.Close()
			err = fmt.Errorf("Слишком много частей multipart")
			return
		}
		if part.FileName() != "" {
			if path != "" || part.FormName() != "file" {
				part.Close()
				err = fmt.Errorf("Разрешён один DAT-файл")
				return
			}
			var file *os.File
			file, err = os.CreateTemp(s.cfg.GeoDir, ".ruopenray-geo-upload-")
			if err != nil {
				part.Close()
				return
			}
			path, name = file.Name(), part.FileName()
			size, err = io.Copy(file, io.LimitReader(part, maxGeoUploadBytes+1))
			if err == nil {
				err = file.Sync()
			}
			closeErr := file.Close()
			part.Close()
			if err == nil {
				err = closeErr
			}
			if err != nil {
				return
			}
			if size == 0 || size > maxGeoUploadBytes {
				err = fmt.Errorf("Размер DAT должен быть от 1 байта до 64 МиБ")
				return
			}
		} else {
			var body []byte
			body, err = io.ReadAll(io.LimitReader(part, (16<<10)+1))
			part.Close()
			if err != nil {
				return
			}
			if len(body) > 16<<10 {
				err = fmt.Errorf("Слишком большое поле multipart")
				return
			}
			fields.Add(part.FormName(), string(body))
		}
	}
	if path == "" {
		err = fmt.Errorf("Выберите DAT-файл")
		return
	}
	r.PostForm, r.Form = fields, fields
	return
}
