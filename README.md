1) Install dependencies (run in project root):


expo install react-native-gesture-handler react-native-reanimated react-native-screens react-native-safe-area-context @react-native-community/masked-view
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs


2) Place images into ./assets (run these exact commands if you generated images with chat):


mkdir -p assets
mv /mnt/data/A_2D_digital_illustration_depicts_a_login_screen_f.png assets/login_image.jpg
mv /mnt/data/A_digital_illustration_presents_a_financial-themed.png assets/add_transaction.jpg


// If the files are in a different path, update the source paths above accordingly.


3) Start app:
npx expo start