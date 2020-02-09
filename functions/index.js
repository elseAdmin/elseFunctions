const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const firestore = admin.firestore();
const realtimeDb = admin.database();

exports.parkingSensorEventListenerUnityOneRohini = functions.database.ref('/unityOneRohini/parking')
    .onWrite((snapshot, context) => {

      var afterValueMap = new Map();
      snapshot.after.forEach((child) => {
        model = new SensorModel(child.val().major,child.val().minor,child.val().name,child.val().updatedAt,child.val().userUid,child.val().value,child.val().slot);
        afterValueMap.set(child.val().name,model);
      });

      var beforeValueMap = new Map();
      snapshot.before.forEach((child) => {
        model = new SensorModel(child.val().major,child.val().minor,child.val().name,child.val().updatedAt,child.val().userUid,child.val().value,child.val().slot);
        beforeValueMap.set(child.val().name,model);
      });
       getChangedSensors(beforeValueMap,afterValueMap);
       return true;
});

function getChangedSensors(beforeValueMap,afterValueMap){
  var changedSensors = new Map();
  beforeValueMap.forEach((child)=>{
    var data = compareSensorData(child, afterValueMap.get(child.name));
    if(data){
      changedSensors.set(afterValueMap.get(child.name).name,afterValueMap.get(child.name));
    }
  });
  changedSensors.forEach((child)=>{
    if(child.value===1){
      console.log('slot ',child.slot,' toggled to 1');
      getBeaconData(child);
    }else if(child.value===0){
      console.log('slot ',child.slot,' toggled to 0');
      //clear beacon visits and mark user at proxi as none;
      //do we really need to clear this data ?
      console.log('slot ',child.slot,' has user = ',child.userUid);
      if(child.userUid !== undefined && child.userUid !== 'none'){
        var user = child.userUid;
        firestore.collection(`users/${user}/parking`).where('status','==','active')
          .get()
          .then((querySnapshot) => {
              console.log(querySnapshot);
              querySnapshot.forEach((doc) => {
                  console.log(doc.id, " => ", doc.data());
                  // Build doc ref from doc.id
                  firestore.collection(`users/${user}/parking`).doc(doc.id).update({'status':'inactive',
                    'parkingOutTime':Date.now(),});
              });
              return '';
         }).catch(reason => {
            console.log(reason);
        });
      }
    realtimeDb.ref('/unityOneRohini/parking').child(child.name).update({'userUid':'none'});//,'updatedAt':Date.now()});
    }
  });
  return true;
}
function getBeaconData(sensor){
   var major = sensor.major;
   var minor = sensor.minor;
   var updatedAt = ((sensor.updatedAt -2)*1000);
   var path = `unityOneRohini/beacons/parking/${major}/${minor}/`;
   var userVsVisitsMap = new Map();
   //below query will fetch all the visits for the parking beacon that are marked in future in reference to the updated at time of the proxi sensor
   firestore.collection(path).where('timestamp',">=",updatedAt).get().then(collections => { // fetch beacon readings for 2 sec prior sensor updatedAt
        collections.forEach((child) => {
          data = child.data();
          console.log(data);
          if(userVsVisitsMap.get(data.userUid) === undefined){
            userVsVisitsMap.set(data.userUid,data.rssi);
          }else{
            var avgDist = userVsVisitsMap.get(data.userUid);
            avgDist = (avgDist + data.rssi)/2;
            userVsVisitsMap.set(data.userUid,avgDist);
          }
        });
     identifyUser(userVsVisitsMap,sensor);
       return '';
    }).catch(reason => {
        console.log('error at getBeaconData',reason);
    });
}

function identifyUser(userVsVisitsMap,sensor){
  var sensorName = sensor.name;
  var maxDist = 1000;
  var user;
    userVsVisitsMap.forEach((value, key)=>{
      console.log("user map value ",value);
      if(value<maxDist){
        maxDist = value;
        user = key;
      }
    });

    if(user !== undefined){
    console.log('identified user = ',user,'for slot ',sensor.slot);
    firestore.collection(`users/${user}/parking`).add({
      'major': sensor.major,
      'minor':sensor.minor,
      'proxiName':sensor.name,
      'parkingInTime':Date.now(),
      'parkingOutTime':0,
      'status':'active',
      'universe':'unityOneRohini'
    });
   realtimeDb.ref('/unityOneRohini/parking').child(sensorName).update({'userUid':user});
 }else{
   console.log('no user identified for slot ',sensor.slot);
   //realtimeDb.ref('/unityOneRohini/parking').child(sensorName).update({'updatedAt':Date.now()});
 }
}

function compareSensorData(beforeData, afterData){
    if(afterData.value === beforeData.value){
      return false;
    }
    return true;
}

class SensorModel{
  constructor(major,minor,name,updatedAt,userUid,value,slot){
    this.major=major;
    this.minor=minor;
    this.name=name;
    this.updatedAt=updatedAt;
    this.userUid=userUid;
    this.value=value;
    this.slot=slot;
  }
}
