#!/bin/sh
# Genera i contenuti di prova (HLS, MP4, immagini) usati dal server mock. Richiede ffmpeg.
set -e
cd "$(dirname "$0")"
mkdir -p media/hls1 media/hls2 media/img
ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc=size=640x360:rate=25 -f lavfi -i sine=frequency=440 -t 12 -c:v libx264 -preset veryfast -profile:v baseline -pix_fmt yuv420p -g 50 -c:a aac -b:a 64k -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename media/hls1/seg%d.ts media/hls1/index.m3u8
ffmpeg -hide_banner -loglevel error -y -f lavfi -i smptebars=size=640x360:rate=25 -f lavfi -i sine=frequency=880 -t 12 -c:v libx264 -preset veryfast -profile:v baseline -pix_fmt yuv420p -g 50 -c:a aac -b:a 64k -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename media/hls2/seg%d.ts media/hls2/index.m3u8
ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=25 -f lavfi -i sine=frequency=330 -t 20 -c:v libx264 -preset veryfast -profile:v baseline -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart media/movie.mp4
cat media/hls1/seg*.ts > media/live.ts
for i in 1 2 3 4; do ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x$(printf '%02x%02x%02x' $((i*50)) $((120-i*20)) $((200-i*30))):size=400x600" -frames:v 1 media/img/p$i.jpg; done
for i in 1 2 3; do ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x$(printf '%02x%02x%02x' $((i*60)) 90 $((250-i*50))):size=200x120" -frames:v 1 media/img/l$i.png; done
echo "media generati"
