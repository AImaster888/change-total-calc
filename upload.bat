@echo off
chcp 65001 >nul
echo =======================================
echo     GitHub 快速上傳腳本 (Git Push)
echo =======================================
echo.

:: 顯示目前的 git 狀態
git status -s
echo.

:: 提示輸入 commit 訊息
set /p commit_msg="請輸入這次更新的說明 (Commit 訊息): "

:: 如果沒有輸入，給予預設值
if "%commit_msg%"=="" set commit_msg="更新專案"

echo.
echo 正在加入檔案...
git add .

echo 正在提交 (Commit)...
git commit -m "%commit_msg%"

echo 正在推送到 GitHub...
git push

echo.
echo =======================================
echo             上傳完成！
echo =======================================
pause
