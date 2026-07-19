import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import os
import subprocess
import tempfile
from imageio_ffmpeg import get_ffmpeg_exe


class MP4Merger:
    def __init__(self, root):
        self.root = root
        self.root.title("MP4 Merger")
        self.root.geometry("700x600")

        notebook = ttk.Notebook(root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        merge_frame = ttk.Frame(notebook)
        images_frame = ttk.Frame(notebook)
        rotate_frame = ttk.Frame(notebook)
        smart_frame = ttk.Frame(notebook)
        notebook.add(merge_frame, text="Merge Videos")
        notebook.add(images_frame, text="Images to Video")
        notebook.add(rotate_frame, text="Rotate Video")
        notebook.add(smart_frame, text="Smart Merge")

        self._create_merge_tab(merge_frame)
        self._create_images_tab(images_frame)
        self._create_rotate_tab(rotate_frame)
        self._create_smart_tab(smart_frame)

    # ── Merge Videos tab ──────────────────────────────────────────

    def _create_merge_tab(self, parent):
        self.merge_files = []

        tk.Label(parent, text="Merge Videos", font=("Arial", 14)).pack(pady=8)

        frame = tk.Frame(parent)
        frame.pack(fill=tk.BOTH, expand=True, padx=10)

        self.merge_listbox = tk.Listbox(frame, selectmode=tk.SINGLE)
        self.merge_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scrollbar = tk.Scrollbar(frame, orient=tk.VERTICAL, command=self.merge_listbox.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.merge_listbox.config(yscrollcommand=scrollbar.set)

        btn_frame = tk.Frame(parent)
        btn_frame.pack(pady=5)

        tk.Button(btn_frame, text="Add Files", command=self.add_files, width=12).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Remove Selected", command=self.remove_selected, width=14).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Move Up", command=self.move_up, width=10).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Move Down", command=self.move_down, width=10).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Clear All", command=self.clear_all, width=10).pack(side=tk.LEFT, padx=3)

        self.merge_progress = ttk.Progressbar(parent, orient=tk.HORIZONTAL, length=500, mode='indeterminate')
        self.merge_progress.pack(pady=5)

        self.merge_status = tk.Label(parent, text="", fg="gray")
        self.merge_status.pack()

        tk.Button(parent, text="Merge Videos", command=self.merge_videos, bg="#4CAF50", fg="white",
                  font=("Arial", 11, "bold"), width=20).pack(pady=10)

    def add_files(self):
        files = filedialog.askopenfilenames(
            title="Select MP4 files",
            filetypes=[("MP4 files", "*.mp4"), ("Video files", "*.mp4;*.avi;*.mov;*.mkv"), ("All files", "*.*")]
        )
        for f in files:
            if f not in self.merge_files:
                self.merge_files.append(f)
                self.merge_listbox.insert(tk.END, os.path.basename(f))
        self.merge_status.config(text=f"{len(self.merge_files)} file(s) added")

    def remove_selected(self):
        sel = self.merge_listbox.curselection()
        if sel:
            idx = sel[0]
            self.merge_listbox.delete(idx)
            del self.merge_files[idx]
            self.merge_status.config(text=f"{len(self.merge_files)} file(s)")

    def move_up(self):
        sel = self.merge_listbox.curselection()
        if sel and sel[0] > 0:
            idx = sel[0]
            self.merge_files[idx], self.merge_files[idx-1] = self.merge_files[idx-1], self.merge_files[idx]
            self._refresh_merge_listbox()
            self.merge_listbox.selection_set(idx-1)

    def move_down(self):
        sel = self.merge_listbox.curselection()
        if sel and sel[0] < len(self.merge_files) - 1:
            idx = sel[0]
            self.merge_files[idx], self.merge_files[idx+1] = self.merge_files[idx+1], self.merge_files[idx]
            self._refresh_merge_listbox()
            self.merge_listbox.selection_set(idx+1)

    def clear_all(self):
        self.merge_files.clear()
        self.merge_listbox.delete(0, tk.END)
        self.merge_status.config(text="")

    def _refresh_merge_listbox(self):
        self.merge_listbox.delete(0, tk.END)
        for f in self.merge_files:
            self.merge_listbox.insert(tk.END, os.path.basename(f))

    def merge_videos(self):
        if len(self.merge_files) < 2:
            messagebox.showwarning("Warning", "Add at least 2 MP4 files.")
            return

        output = filedialog.asksaveasfilename(
            title="Save merged video as",
            defaultextension=".mp4",
            filetypes=[("MP4 files", "*.mp4")]
        )
        if not output:
            return

        self.merge_progress.start()
        self.merge_status.config(text="Merging via ffmpeg (stream copy)...")
        self.root.update()

        filelist_path = None
        try:
            ffmpeg = get_ffmpeg_exe()

            filelist_path = os.path.join(tempfile.gettempdir(), "opencode_merge_list.txt")
            with open(filelist_path, "w", encoding="utf-8") as f:
                for path in self.merge_files:
                    escaped = path.replace(chr(39), chr(92) + chr(39))
                    f.write(f"file '{escaped}'\n")

            cmd = [
                ffmpeg, "-y", "-f", "concat", "-safe", "0",
                "-i", filelist_path,
                "-c", "copy",
                output
            ]

            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW,
                encoding="utf-8", errors="replace"
            )

            for line in proc.stdout:
                line = line.strip()
                if line:
                    self.merge_status.config(text=line[-60:])
                    self.root.update()

            proc.wait()

            if proc.returncode == 0:
                self.merge_progress.stop()
                self.merge_status.config(text="Done!")
                messagebox.showinfo("Success", f"Video saved to:\n{output}")
            else:
                self.merge_progress.stop()
                self.merge_status.config(text="ffmpeg error - try re-encode mode")
                self._merge_legacy(output)

        except Exception:
            self.merge_progress.stop()
            self.merge_status.config(text="Error - fallback to re-encode...")
            self._merge_legacy(output)

        finally:
            if filelist_path and os.path.exists(filelist_path):
                try:
                    os.remove(filelist_path)
                except Exception:
                    pass

    def _merge_legacy(self, output):
        self.merge_status.config(text="Re-encoding merge (slower)...")
        self.root.update()
        try:
            from moviepy import VideoFileClip, concatenate_videoclips

            clips = []
            for f in self.merge_files:
                self.merge_status.config(text=f"Loading: {os.path.basename(f)}")
                self.root.update()
                clips.append(VideoFileClip(f))

            self.merge_status.config(text="Merging with re-encode...")
            self.root.update()

            final = concatenate_videoclips(clips)
            final.write_videofile(output, codec="libx264", audio_codec="aac", logger=None)

            for c in clips:
                c.close()
            final.close()

            self.merge_progress.stop()
            self.merge_status.config(text="Done!")
            messagebox.showinfo("Success", f"Video saved to:\n{output}")
        except Exception as e:
            self.merge_progress.stop()
            self.merge_status.config(text="Error")
            messagebox.showerror("Error", f"Merge failed:\n{e}")

    # ── Images to Video tab ───────────────────────────────────────

    def _create_images_tab(self, parent):
        self.img_files = []
        self.audio_path = None

        tk.Label(parent, text="Images to Video", font=("Arial", 14)).pack(pady=8)

        frame = tk.Frame(parent)
        frame.pack(fill=tk.BOTH, expand=True, padx=10)

        self.img_listbox = tk.Listbox(frame, selectmode=tk.SINGLE)
        self.img_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scrollbar = tk.Scrollbar(frame, orient=tk.VERTICAL, command=self.img_listbox.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.img_listbox.config(yscrollcommand=scrollbar.set)

        btn_frame = tk.Frame(parent)
        btn_frame.pack(pady=5)

        tk.Button(btn_frame, text="Add Images", command=self.add_images, width=12).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Remove Selected", command=self.remove_image, width=14).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Move Up", command=self.img_move_up, width=10).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Move Down", command=self.img_move_down, width=10).pack(side=tk.LEFT, padx=3)
        tk.Button(btn_frame, text="Clear All", command=self.clear_images, width=10).pack(side=tk.LEFT, padx=3)

        options_frame = tk.Frame(parent)
        options_frame.pack(pady=5, fill=tk.X, padx=10)

        self.duration_mode = tk.StringVar(value="per_image")
        tk.Radiobutton(options_frame, text="Per image (s):", variable=self.duration_mode,
                       value="per_image", command=self._toggle_duration_mode).pack(side=tk.LEFT)
        self.per_image_var = tk.DoubleVar(value=3.0)
        self.per_image_spin = tk.Spinbox(options_frame, from_=0.5, to=600, increment=0.5,
                                         textvariable=self.per_image_var, width=6)
        self.per_image_spin.pack(side=tk.LEFT, padx=2)

        tk.Radiobutton(options_frame, text="Total video (s):", variable=self.duration_mode,
                       value="total", command=self._toggle_duration_mode).pack(side=tk.LEFT, padx=(10, 0))
        self.total_dur_var = tk.DoubleVar(value=60.0)
        self.total_dur_spin = tk.Spinbox(options_frame, from_=1, to=36000, increment=1,
                                         textvariable=self.total_dur_var, width=6, state="disabled")
        self.total_dur_spin.pack(side=tk.LEFT, padx=2)

        tk.Label(options_frame, text="  FPS:").pack(side=tk.LEFT, padx=(10, 0))
        self.fps_var = tk.IntVar(value=30)
        tk.Spinbox(options_frame, from_=1, to=60, textvariable=self.fps_var, width=5).pack(side=tk.LEFT, padx=2)

        tk.Label(options_frame, text="  Codec:").pack(side=tk.LEFT, padx=(10, 0))
        self.codec_var = tk.StringVar(value="libx264")
        self.codec_combo = ttk.Combobox(options_frame, textvariable=self.codec_var,
                                        state="readonly", width=20)
        self.codec_combo.pack(side=tk.LEFT, padx=2)

        self.root.after(100, self._populate_codecs)

        audio_frame = tk.Frame(parent)
        audio_frame.pack(pady=5, fill=tk.X, padx=10)

        tk.Label(audio_frame, text="Audio file (optional):").pack(side=tk.LEFT)
        self.audio_label = tk.Label(audio_frame, text="None", fg="gray", width=40, anchor="w")
        self.audio_label.pack(side=tk.LEFT, padx=5)
        tk.Button(audio_frame, text="Browse", command=self.browse_audio, width=8).pack(side=tk.LEFT, padx=2)
        tk.Button(audio_frame, text="Clear", command=self.clear_audio, width=6).pack(side=tk.LEFT, padx=2)

        self.img_progress = ttk.Progressbar(parent, orient=tk.HORIZONTAL, length=500, mode='indeterminate')
        self.img_progress.pack(pady=5)

        self.img_status = tk.Label(parent, text="", fg="gray")
        self.img_status.pack()

        tk.Button(parent, text="Create Video", command=self.create_video_from_images,
                  bg="#2196F3", fg="white", font=("Arial", 11, "bold"), width=20).pack(pady=10)

    def add_images(self):
        files = filedialog.askopenfilenames(
            title="Select images",
            filetypes=[
                ("Image files", "*.jpg;*.jpeg;*.png;*.bmp;*.tiff;*.tif;*.webp"),
                ("All files", "*.*")
            ]
        )
        for f in files:
            if f not in self.img_files:
                self.img_files.append(f)
                self.img_listbox.insert(tk.END, os.path.basename(f))
        self.img_status.config(text=f"{len(self.img_files)} image(s) added")

    def remove_image(self):
        sel = self.img_listbox.curselection()
        if sel:
            idx = sel[0]
            self.img_listbox.delete(idx)
            del self.img_files[idx]
            self.img_status.config(text=f"{len(self.img_files)} image(s)")

    def img_move_up(self):
        sel = self.img_listbox.curselection()
        if sel and sel[0] > 0:
            idx = sel[0]
            self.img_files[idx], self.img_files[idx-1] = self.img_files[idx-1], self.img_files[idx]
            self._refresh_img_listbox()
            self.img_listbox.selection_set(idx-1)

    def img_move_down(self):
        sel = self.img_listbox.curselection()
        if sel and sel[0] < len(self.img_files) - 1:
            idx = sel[0]
            self.img_files[idx], self.img_files[idx+1] = self.img_files[idx+1], self.img_files[idx]
            self._refresh_img_listbox()
            self.img_listbox.selection_set(idx+1)

    def clear_images(self):
        self.img_files.clear()
        self.img_listbox.delete(0, tk.END)
        self.img_status.config(text="")

    def _refresh_img_listbox(self):
        self.img_listbox.delete(0, tk.END)
        for f in self.img_files:
            self.img_listbox.insert(tk.END, os.path.basename(f))

    def browse_audio(self):
        path = filedialog.askopenfilename(
            title="Select audio file",
            filetypes=[
                ("Audio files", "*.mp3;*.wav;*.aac;*.flac;*.ogg;*.m4a;*.wma"),
                ("All files", "*.*")
            ]
        )
        if path:
            self.audio_path = path
            self.audio_label.config(text=os.path.basename(path), fg="black")

    def clear_audio(self):
        self.audio_path = None
        self.audio_label.config(text="None", fg="gray")

    def _populate_codecs(self):
        encoders = self._detect_encoders()
        self.codec_combo["values"] = encoders
        self.codec_var.set("libx264")

    def _toggle_duration_mode(self):
        if self.duration_mode.get() == "total":
            self.per_image_spin.config(state="disabled")
            self.total_dur_spin.config(state="normal")
        else:
            self.per_image_spin.config(state="normal")
            self.total_dur_spin.config(state="disabled")

    def create_video_from_images(self):
        if len(self.img_files) < 1:
            messagebox.showwarning("Warning", "Add at least 1 image.")
            return

        output = filedialog.asksaveasfilename(
            title="Save video as",
            defaultextension=".mp4",
            filetypes=[("MP4 files", "*.mp4")]
        )
        if not output:
            return

        n = len(self.img_files)
        if self.duration_mode.get() == "total":
            total_dur = self.total_dur_var.get()
            duration = total_dur / n
        else:
            duration = self.per_image_var.get()
        fps = self.fps_var.get()

        self.img_progress.start()
        self.img_status.config(text="Creating video from images...")
        self.root.update()

        try:
            self._images_to_video_ffmpeg(self.img_files, duration, output, self.audio_path, fps)
            return
        except Exception as e:
            self.img_progress.stop()
            self.img_status.config(text="Error")
            messagebox.showerror("Error", f"ffmpeg failed:\n{e}")

    def _detect_encoders(self):
        ffmpeg = get_ffmpeg_exe()
        encoders = ["libx264"]
        try:
            r = subprocess.run([ffmpeg, "-encoders"], capture_output=True, text=True,
                               creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
            out = r.stdout + r.stderr
            if "h264_nvenc" in out:
                encoders.append("h264_nvenc (GPU)")
            if "h264_amf" in out:
                encoders.append("h264_amf (GPU)")
            if "h264_qsv" in out:
                encoders.append("h264_qsv (GPU)")
            if "h264_videotoolbox" in out:
                encoders.append("h264_videotoolbox (GPU)")
            if "mjpeg" in out:
                encoders.append("mjpeg (макс. скорость)")
        except Exception:
            pass
        return encoders

    def _images_to_video_ffmpeg(self, image_paths, duration, output, audio_path=None, fps=30):
        ffmpeg = get_ffmpeg_exe()
        n = len(image_paths)
        total_dur = n * duration
        codec = self.codec_var.get().split()[0] if " " in self.codec_var.get() else self.codec_var.get()

        for path in image_paths:
            if not os.path.isfile(path):
                raise FileNotFoundError(f"File not found: {path}")
        if audio_path and not os.path.isfile(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        try:
            self._ffmpeg_temp_sequence(ffmpeg, image_paths, duration, output, audio_path, fps, codec, total_dur)
        except RuntimeError as e:
            if codec != "libx264":
                self.img_status.config(text=f"Codec {codec} failed, retrying with libx264...")
                self.root.update()
                self._ffmpeg_temp_sequence(ffmpeg, image_paths, duration, output, audio_path, fps, "libx264", total_dur)
            else:
                raise

    def _run_ffmpeg(self, cmd, status_text, total_dur):
        self.img_status.config(text=status_text)
        self.root.update()
        cmd = cmd[:1] + ["-loglevel", "error", "-stats"] + cmd[1:]
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW,
            encoding="utf-8", errors="replace"
        )
        last_output = []
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            last_output.append(line)
            if len(last_output) > 10:
                last_output.pop(0)
            if "frame=" in line:
                parts = line.split()
                for p in parts:
                    if p.startswith("frame="):
                        self.img_status.config(text=f"{status_text} | {p}")
                        self.root.update()
                        break
        proc.wait()
        if proc.returncode != 0:
            detail = "\n".join(last_output[-5:])
            raise RuntimeError(f"exit code {proc.returncode}. ffmpeg output:\n{detail}")

    def _ffmpeg_temp_sequence(self, ffmpeg, image_paths, duration, output, audio_path, fps, codec, total_dur):
        temp_dir = os.path.join(tempfile.gettempdir(), "opencode_img_seq_" + str(os.getpid()))
        os.makedirs(temp_dir, exist_ok=True)
        try:
            self.img_status.config(text=f"Preparing {len(image_paths)} files in temp folder...")
            self.root.update()

            ext = os.path.splitext(image_paths[0])[1] if image_paths else ".png"
            for i, img in enumerate(image_paths):
                src_name = f"{i+1:08d}{ext}"
                dst = os.path.join(temp_dir, src_name)
                try:
                    os.link(img, dst)
                except Exception:
                    import shutil
                    shutil.copy2(img, dst)

            input_pattern = os.path.join(temp_dir, f"%08d{ext}")
            framerate = 1.0 / duration
            cmd = [ffmpeg, "-y", "-framerate", str(framerate), "-i", input_pattern]
            if audio_path:
                cmd.extend(["-i", audio_path])
            cmd.extend(self._video_codec_args(codec, fps))
            if audio_path:
                cmd.extend(["-c:a", "aac", "-shortest"])
            cmd.append(output)

            self._run_ffmpeg(cmd, f"Encoding {total_dur:.1f}s video (temp sequence)...", total_dur)
        finally:
            for f in os.listdir(temp_dir):
                try:
                    os.remove(os.path.join(temp_dir, f))
                except Exception:
                    pass
            try:
                os.rmdir(temp_dir)
            except Exception:
                pass

    def _video_codec_args(self, codec, fps):
        args = ["-c:v", codec, "-pix_fmt", "yuv420p", "-r", str(fps)]
        if codec == "libx264":
            args.extend(["-preset", "ultrafast", "-crf", "23"])
        elif codec == "mjpeg":
            args.extend(["-q:v", "5"])
        return args

    def _images_to_video_moviepy(self, image_paths, duration, output, audio_path=None, fps=30):
        from moviepy import ImageClip, AudioFileClip, concatenate_videoclips

        self.img_status.config(text="Loading images...")
        self.root.update()

        clips = []
        n = len(image_paths)
        for i, img_path in enumerate(image_paths):
            self.img_status.config(text=f"Loading image {i+1}/{n}: {os.path.basename(img_path)}")
            self.root.update()
            clip = ImageClip(img_path, duration=duration)
            clips.append(clip)

        self.img_status.config(text="Concatenating...")
        self.root.update()

        video = concatenate_videoclips(clips, method="chain")

        if audio_path:
            self.img_status.config(text="Adding audio...")
            self.root.update()
            audio = AudioFileClip(audio_path)
            if audio.duration > video.duration:
                audio = audio.with_duration(video.duration)
            video = video.with_audio(audio)

        total_dur = n * duration
        self.img_status.config(text=f"Rendering {total_dur:.1f}s video (this may take a while)...")
        self.root.update()

        video.write_videofile(
            output,
            codec="libx264",
            audio_codec="aac",
            fps=fps,
            logger=None
        )

        for c in clips:
            c.close()
        video.close()
        if audio_path:
            audio.close()

        self.img_progress.stop()
        self.img_status.config(text="Done!")
        messagebox.showinfo("Success", f"Video saved to:\n{output}")


    # ── Rotate Video tab ──────────────────────────────────────────

    def _create_rotate_tab(self, parent):
        self.rotate_file = None

        tk.Label(parent, text="Rotate Video 90°", font=("Arial", 14)).pack(pady=8)

        file_frame = tk.Frame(parent)
        file_frame.pack(pady=10, fill=tk.X, padx=10)

        tk.Label(file_frame, text="Input file:").pack(side=tk.LEFT)
        self.rotate_file_label = tk.Label(file_frame, text="None", fg="gray", width=55, anchor="w", relief=tk.SUNKEN, bd=1)
        self.rotate_file_label.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        tk.Button(file_frame, text="Browse", command=self.browse_rotate_file, width=8).pack(side=tk.LEFT, padx=2)

        dir_frame = tk.Frame(parent)
        dir_frame.pack(pady=5, fill=tk.X, padx=10)

        self.rotate_dir = tk.StringVar(value="right")
        tk.Radiobutton(dir_frame, text="90° Right (clockwise)", variable=self.rotate_dir,
                       value="right", font=("Arial", 10)).pack(anchor="w", padx=20, pady=2)
        tk.Radiobutton(dir_frame, text="90° Left (counter-clockwise)", variable=self.rotate_dir,
                       value="left", font=("Arial", 10)).pack(anchor="w", padx=20, pady=2)
        tk.Radiobutton(dir_frame, text="180° (upside down)", variable=self.rotate_dir,
                       value="180", font=("Arial", 10)).pack(anchor="w", padx=20, pady=2)

        info_frame = tk.LabelFrame(parent, text="Output", padx=10, pady=5)
        info_frame.pack(pady=10, fill=tk.X, padx=10)

        self.rotate_output_label = tk.Label(info_frame, text="Will be saved as: [original]_rotated.mp4", fg="gray")
        self.rotate_output_label.pack()

        self.rotate_progress = ttk.Progressbar(parent, orient=tk.HORIZONTAL, length=500, mode='indeterminate')
        self.rotate_progress.pack(pady=5)

        self.rotate_status = tk.Label(parent, text="", fg="gray")
        self.rotate_status.pack()

        tk.Button(parent, text="Rotate Video", command=self.rotate_video,
                  bg="#FF9800", fg="white", font=("Arial", 11, "bold"), width=20).pack(pady=10)

    def browse_rotate_file(self):
        path = filedialog.askopenfilename(
            title="Select video file",
            filetypes=[("Video files", "*.mp4;*.avi;*.mov;*.mkv;*.webm"), ("All files", "*.*")]
        )
        if path:
            self.rotate_file = path
            self.rotate_file_label.config(text=path, fg="black")
            base, ext = os.path.splitext(path)
            out_name = f"{base}_rotated{ext}"
            self.rotate_output_label.config(text=f"Will be saved as: {out_name}", fg="gray")
            self.rotate_status.config(text="")

    def rotate_video(self):
        if not self.rotate_file:
            messagebox.showwarning("Warning", "Select a video file first.")
            return

        base, ext = os.path.splitext(self.rotate_file)
        output = f"{base}_rotated{ext}"

        self.rotate_progress.start()
        self.rotate_status.config(text="Rotating via ffmpeg...")
        self.root.update()

        try:
            ffmpeg = get_ffmpeg_exe()

            val = self.rotate_dir.get()
            if val == "right":
                filter_str = "transpose=1"
            elif val == "left":
                filter_str = "transpose=2"
            else:
                filter_str = "transpose=1,transpose=1"

            codec = self._pick_fastest_encoder()
            cmd = [
                ffmpeg, "-y",
                "-i", self.rotate_file,
                "-vf", filter_str,
                "-c:v", codec,
            ]
            if codec == "libx264":
                cmd += ["-preset", "ultrafast", "-crf", "28"]
            elif "nvenc" in codec:
                cmd += ["-preset", "p1", "-cq", "28"]
            elif "amf" in codec:
                cmd += ["-quality", "speed", "-cq", "28"]
            elif "qsv" in codec:
                cmd += ["-preset", "veryfast", "-global_quality", "28"]
            cmd += ["-c:a", "copy", output]

            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW,
                encoding="utf-8", errors="replace"
            )

            for line in proc.stdout:
                line = line.strip()
                if line:
                    self.rotate_status.config(text=line[-60:])
                    self.root.update()

            proc.wait()

            if proc.returncode == 0:
                self.rotate_progress.stop()
                self.rotate_status.config(text="Done!")
                messagebox.showinfo("Success", f"Video saved to:\n{output}")
            else:
                self.rotate_progress.stop()
                self.rotate_status.config(text="ffmpeg error")
                messagebox.showerror("Error", "Failed to rotate video.")

        except Exception as e:
            self.rotate_progress.stop()
            self.rotate_status.config(text="Error")
            messagebox.showerror("Error", f"Rotation failed:\n{e}")

    def _pick_fastest_encoder(self):
        """
        Returns the fastest available H.264 encoder name (for speed → GPU or ultrafast CPU).
        """
        ffmpeg = get_ffmpeg_exe()
        try:
            r = subprocess.run([ffmpeg, "-encoders"], capture_output=True, text=True,
                               creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
            out = r.stdout + r.stderr
            # GPU encoders (much faster than CPU)
            if "h264_nvenc" in out:
                return "h264_nvenc"
            if "h264_amf" in out:
                return "h264_amf"
            if "h264_qsv" in out:
                return "h264_qsv"
            if "h264_videotoolbox" in out:
                return "h264_videotoolbox"
        except Exception:
            pass
        return "libx264"


    # ── Smart Merge tab ───────────────────────────────────────────

    def _create_smart_tab(self, parent):
        self.smart_files = []
        self.smart_resolutions = {}

        tk.Label(parent, text="Smart Merge (handles different resolutions)",
                 font=("Arial", 14)).pack(pady=6)

        frame = tk.Frame(parent)
        frame.pack(fill=tk.BOTH, expand=True, padx=10)

        self.smart_listbox = tk.Listbox(frame, selectmode=tk.SINGLE)
        self.smart_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scrollbar = tk.Scrollbar(frame, orient=tk.VERTICAL, command=self.smart_listbox.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.smart_listbox.config(yscrollcommand=scrollbar.set)

        btn_frame = tk.Frame(parent)
        btn_frame.pack(pady=3)

        tk.Button(btn_frame, text="Add Files", command=self.smart_add_files, width=10).pack(side=tk.LEFT, padx=2)
        tk.Button(btn_frame, text="Remove", command=self.smart_remove, width=8).pack(side=tk.LEFT, padx=2)
        tk.Button(btn_frame, text="Move Up", command=self.smart_move_up, width=8).pack(side=tk.LEFT, padx=2)
        tk.Button(btn_frame, text="Move Down", command=self.smart_move_down, width=8).pack(side=tk.LEFT, padx=2)
        tk.Button(btn_frame, text="Clear", command=self.smart_clear, width=8).pack(side=tk.LEFT, padx=2)
        tk.Button(btn_frame, text="Analyze Resolutions", command=self.smart_analyze,
                  bg="#9C27B0", fg="white", width=16).pack(side=tk.LEFT, padx=5)

        info_frame = tk.Frame(parent)
        info_frame.pack(pady=3, fill=tk.X, padx=10)

        tk.Label(info_frame, text="Resolutions:").pack(side=tk.LEFT)
        self.smart_res_label = tk.Label(info_frame, text="(click Analyze)", fg="gray", anchor="w")
        self.smart_res_label.pack(side=tk.LEFT, padx=5)

        tk.Label(info_frame, text="  Target:").pack(side=tk.LEFT, padx=(10, 0))
        self.smart_target_var = tk.StringVar(value="Auto")
        self.smart_target_combo = ttk.Combobox(info_frame, textvariable=self.smart_target_var,
                                                state="readonly", width=18)
        self.smart_target_combo.pack(side=tk.LEFT, padx=2)

        mode_frame = tk.Frame(parent)
        mode_frame.pack(pady=3, fill=tk.X, padx=10)

        self.smart_mode = tk.StringVar(value="auto")
        tk.Radiobutton(mode_frame, text="Auto (stream copy if identical res)", variable=self.smart_mode,
                       value="auto").pack(side=tk.LEFT)
        tk.Radiobutton(mode_frame, text="Force re-encode", variable=self.smart_mode,
                       value="reencode").pack(side=tk.LEFT, padx=10)

        tk.Label(mode_frame, text="  Codec:").pack(side=tk.LEFT, padx=(5, 0))
        self.smart_codec_var = tk.StringVar(value="Auto")
        self.smart_codec_combo = ttk.Combobox(mode_frame, textvariable=self.smart_codec_var,
                                               state="readonly", width=22)
        self.smart_codec_combo.pack(side=tk.LEFT, padx=2)
        self.root.after(100, self._populate_smart_codecs)

        self.smart_progress = ttk.Progressbar(parent, orient=tk.HORIZONTAL, length=500, mode='indeterminate')
        self.smart_progress.pack(pady=4)

        self.smart_status = tk.Label(parent, text="", fg="gray")
        self.smart_status.pack()

        tk.Button(parent, text="Merge Videos", command=self.smart_merge,
                  bg="#9C27B0", fg="white", font=("Arial", 11, "bold"), width=20).pack(pady=8)

    def smart_add_files(self):
        files = filedialog.askopenfilenames(
            title="Select video files",
            filetypes=[("Video files", "*.mp4;*.avi;*.mov;*.mkv"), ("All files", "*.*")]
        )
        for f in files:
            if f not in self.smart_files:
                self.smart_files.append(f)
                self.smart_listbox.insert(tk.END, os.path.basename(f))
        self.smart_status.config(text=f"{len(self.smart_files)} file(s)")

    def smart_remove(self):
        sel = self.smart_listbox.curselection()
        if sel:
            idx = sel[0]
            path = self.smart_files[idx]
            self.smart_listbox.delete(idx)
            del self.smart_files[idx]
            self.smart_resolutions.pop(path, None)
            self._smart_update_res_label()

    def smart_move_up(self):
        sel = self.smart_listbox.curselection()
        if sel and sel[0] > 0:
            idx = sel[0]
            self.smart_files[idx], self.smart_files[idx-1] = self.smart_files[idx-1], self.smart_files[idx]
            self._smart_refresh_listbox()
            self.smart_listbox.selection_set(idx-1)

    def smart_move_down(self):
        sel = self.smart_listbox.curselection()
        if sel and sel[0] < len(self.smart_files) - 1:
            idx = sel[0]
            self.smart_files[idx], self.smart_files[idx+1] = self.smart_files[idx+1], self.smart_files[idx]
            self._smart_refresh_listbox()
            self.smart_listbox.selection_set(idx+1)

    def smart_clear(self):
        self.smart_files.clear()
        self.smart_resolutions.clear()
        self.smart_listbox.delete(0, tk.END)
        self.smart_res_label.config(text="(click Analyze)")
        self.smart_target_combo["values"] = []
        self.smart_target_var.set("Auto")
        self.smart_status.config(text="")

    def _smart_refresh_listbox(self):
        self.smart_listbox.delete(0, tk.END)
        for f in self.smart_files:
            self.smart_listbox.insert(tk.END, os.path.basename(f))

    def smart_analyze(self):
        if not self.smart_files:
            messagebox.showwarning("Warning", "Add files first.")
            return

        self.smart_status.config(text="Analyzing resolutions...")
        self.root.update()

        self.smart_resolutions = {}
        ffmpeg = get_ffmpeg_exe()
        all_res = {}

        for path in self.smart_files:
            res = self._get_resolution(ffmpeg, path)
            self.smart_resolutions[path] = res
            all_res[res] = all_res.get(res, 0) + 1

        self._smart_update_res_label()

        vals = sorted(set(self.smart_resolutions.values()))
        most_common = max(set(self.smart_resolutions.values()),
                         key=list(self.smart_resolutions.values()).count)
        self.smart_target_combo["values"] = ["Auto"] + vals
        self.smart_target_var.set(f"Auto ({most_common})" if len(vals) == 1 else "Auto")
        self.smart_status.config(text=f"Analyzed {len(self.smart_files)} file(s) — {len(vals)} unique resolution(s)")

    def _get_resolution(self, ffmpeg, path):
        try:
            cmd = [ffmpeg, "-v", "error", "-select_streams", "v:0",
                   "-show_entries", "stream=width,height",
                   "-of", "csv=p=0", path]
            r = subprocess.run(cmd, capture_output=True, text=True,
                               creationflags=subprocess.CREATE_NO_WINDOW, timeout=30)
            out = (r.stdout + r.stderr).strip()
            if "," in out:
                parts = out.split(",")
                w, h = parts[0].strip(), parts[1].strip()
                if w.isdigit() and h.isdigit():
                    return f"{w}x{h}"
        except Exception:
            pass
        return "Unknown"

    def _smart_update_res_label(self):
        if not self.smart_resolutions:
            self.smart_res_label.config(text="(click Analyze)")
            return
        parts = []
        for f in self.smart_files:
            res = self.smart_resolutions.get(f, "?")
            parts.append(f"{os.path.basename(f)} → {res}")
        self.smart_res_label.config(text=" | ".join(parts), wraplength=650)

    def _populate_smart_codecs(self):
        encoders = self._detect_encoders()
        all_c = ["Auto"] + encoders
        self.smart_codec_combo["values"] = all_c
        self.smart_codec_var.set("Auto")

    def smart_merge(self):
        if len(self.smart_files) < 2:
            messagebox.showwarning("Warning", "Add at least 2 files.")
            return

        if not self.smart_resolutions:
            self.smart_analyze()

        output = filedialog.asksaveasfilename(
            title="Save merged video as",
            defaultextension=".mp4",
            filetypes=[("MP4 files", "*.mp4")]
        )
        if not output:
            return

        uniq = set(self.smart_resolutions.values())
        target_raw = self.smart_target_var.get()
        if target_raw.startswith("Auto"):
            most_common = max(set(self.smart_resolutions.values()),
                             key=list(self.smart_resolutions.values()).count)
            target_res = most_common
        else:
            target_res = target_raw

        all_same = len(uniq) == 1
        mode = self.smart_mode.get()
        do_stream = all_same and mode == "auto"

        self.smart_progress.start()
        self.smart_status.config(text="Merging..." if do_stream else "Re-encoding merge...")
        self.root.update()

        try:
            ffmpeg = get_ffmpeg_exe()

            filelist_path = os.path.join(tempfile.gettempdir(), "opencode_smart_list.txt")
            with open(filelist_path, "w", encoding="utf-8") as f:
                for path in self.smart_files:
                    escaped = path.replace(chr(39), chr(92) + chr(39))
                    f.write(f"file '{escaped}'\n")

            if do_stream:
                cmd = [ffmpeg, "-y", "-f", "concat", "-safe", "0",
                       "-i", filelist_path, "-c", "copy", output]
            else:
                w, h = target_res.split("x")
                scale = f"scale={w}:{h}:flags=bilinear,setsar=1"
                codec_raw = self.smart_codec_var.get()
                if codec_raw == "Auto" or not codec_raw:
                    codec = self._pick_fastest_encoder()
                else:
                    codec = codec_raw.split()[0] if " " in codec_raw else codec_raw

                cmd = [ffmpeg, "-y", "-f", "concat", "-safe", "0",
                       "-i", filelist_path,
                       "-vf", scale,
                       "-c:v", codec]
                if codec == "libx264":
                    cmd += ["-preset", "ultrafast", "-crf", "26"]
                elif "nvenc" in codec:
                    cmd += ["-preset", "p1", "-cq", "26"]
                elif "amf" in codec:
                    cmd += ["-quality", "speed", "-cq", "26"]
                elif "qsv" in codec:
                    cmd += ["-preset", "veryfast", "-global_quality", "26"]
                cmd += ["-c:a", "aac", "-b:a", "128k", output]

            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW,
                encoding="utf-8", errors="replace"
            )

            for line in proc.stdout:
                line = line.strip()
                if line:
                    self.smart_status.config(text=line[-65:])
                    self.root.update()

            proc.wait()

            if proc.returncode == 0:
                self.smart_progress.stop()
                self.smart_status.config(text="Done!")
                messagebox.showinfo("Success", f"Video saved to:\n{output}")
            else:
                # fallback: force re-encode if stream copy failed
                if do_stream and proc.returncode != 0:
                    self.smart_status.config(text="Stream copy failed, retrying with re-encode...")
                    self.root.update()
                    self.smart_mode.set("reencode")
                    self.smart_merge()
                    return
                self.smart_progress.stop()
                self.smart_status.config(text="Error")
                messagebox.showerror("Error", "Merge failed.")

        except Exception as e:
            self.smart_progress.stop()
            self.smart_status.config(text="Error")
            messagebox.showerror("Error", f"Merge failed:\n{e}")
        finally:
            if os.path.exists(filelist_path):
                try:
                    os.remove(filelist_path)
                except Exception:
                    pass

if __name__ == "__main__":
    root = tk.Tk()
    app = MP4Merger(root)
    root.mainloop()
