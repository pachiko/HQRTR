Rem ..\..\ffmpeg-5.1.2-essentials_build\bin\ffmpeg.exe -y -gamma 2.2 -r 20 -i examples\pink-room\input\beauty_%%d.exr -vcodec libx264 -pix_fmt yuv420p -preset slow -crf 18 pinkroom-input.mp4
Rem ..\..\ffmpeg-5.1.2-essentials_build\bin\ffmpeg.exe -y -gamma 2.2 -r 20 -i examples\pink-room\output\result_%%d.exr -vcodec libx264 -pix_fmt yuv420p -preset slow -crf 18 pinkroom-result.mp4
Rem ..\..\ffmpeg-5.1.2-essentials_build\bin\ffmpeg.exe -y -gamma 2.2 -r 20 -i examples\box\input\beauty_%%d.exr -vcodec libx264 -pix_fmt yuv420p -preset slow -crf 18 box-input.mp4
..\..\ffmpeg-5.1.2-essentials_build\bin\ffmpeg.exe -y -gamma 2.2 -r 20 -i examples\box\output\result_%%d.exr -vcodec libx264 -pix_fmt yuv420p -preset slow -crf 18 box-result.mp4
